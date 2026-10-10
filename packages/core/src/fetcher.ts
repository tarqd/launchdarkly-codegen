/**
 * Live fetcher (DESIGN.md → Fetcher). Calls the LaunchDarkly REST API and
 * returns the raw responses as a `Snapshot`; it never interprets them.
 */

import { CodegenError } from './errors.js';
import { SNAPSHOT_VERSION, type ApiFlagsPage, type Snapshot } from './snapshot.js';

/** What to fetch and how to connect. */
export interface FetchRequest {
  projectKey: string;
  baseUri: string;
  accessToken: string;
}

/** Side effects, injectable for tests. */
export interface FetchDeps {
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  sleep: (ms: number) => Promise<void>;
  /** Epoch milliseconds. */
  now: () => number;
  /** In [0, 1), for jitter. */
  random: () => number;
}

export const defaultFetchDeps: FetchDeps = {
  fetch: (input, init) => globalThis.fetch(input, init),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
  random: () => Math.random(),
};

/** The API version every flags-list call pins. */
export const FLAGS_API_VERSION = '20240415';
export const FLAGS_PAGE_LIMIT = 100;

/** Fetches the project's flags list, page by page, into a snapshot. */
export async function fetchSnapshot(request: FetchRequest, deps: FetchDeps = defaultFetchDeps): Promise<Snapshot> {
  const client = new LdApiClient(request.baseUri, request.accessToken, deps);
  const flagPages = await client.getPages<ApiFlagsPage>(flagsListUrl(request), FLAGS_API_VERSION);
  return {
    snapshotVersion: SNAPSHOT_VERSION,
    projectKey: request.projectKey,
    baseUri: request.baseUri,
    flagPages,
  };
}

/**
 * The first flags-list URL. `env` and `expand` are never sent. Selection
 * params (e.g. a tag `filter`) are added here.
 */
export function flagsListUrl(request: FetchRequest): URL {
  const url = apiUrl(request.baseUri, `/api/v2/flags/${encodeURIComponent(request.projectKey)}`);
  url.searchParams.set('limit', String(FLAGS_PAGE_LIMIT));
  url.searchParams.set('sort', 'key');
  return url;
}

function apiUrl(baseUri: string, path: string): URL {
  return new URL(path, baseUri.endsWith('/') ? baseUri : `${baseUri}/`);
}

/** The paging part of a list response. */
export interface PagedBody {
  _links?: Record<string, { href: string; type?: string } | undefined>;
}

/** Authenticated GETs against the LaunchDarkly REST API. */
export class LdApiClient {
  constructor(
    private readonly baseUri: string,
    private readonly accessToken: string,
    private readonly deps: FetchDeps,
  ) {}

  /**
   * GETs `first` and every page after it, following `_links.next` until it
   * is absent. Pages are returned raw, in fetch order. `hasNext` can add a
   * stop condition for endpoints whose `_links` is optional.
   */
  async getPages<P extends PagedBody>(
    first: URL,
    apiVersion: string,
    hasNext: (page: P, pages: P[]) => boolean = () => true,
  ): Promise<P[]> {
    const pages: P[] = [];
    const seen = new Set<string>();
    let url: URL | undefined = first;
    while (url) {
      if (seen.has(url.href)) throw new CodegenError(`GET ${url.pathname}: pagination loops back to ${url.href}`);
      seen.add(url.href);
      const body: P = await this.getJson<P>(url, apiVersion);
      pages.push(body);
      const next = body._links?.next?.href;
      url = next !== undefined && hasNext(body, pages) ? new URL(next, this.baseUri) : undefined;
    }
    return pages;
  }

  /** One GET, retried on 429 as DESIGN.md → Fetcher → Rate limits says. */
  async getJson<T>(url: URL, apiVersion: string): Promise<T> {
    for (let retries = 0; ; retries++) {
      let res: Response;
      try {
        res = await this.deps.fetch(url.href, {
          headers: { Authorization: this.accessToken, 'LD-API-Version': apiVersion, Accept: 'application/json' },
        });
      } catch (err) {
        const cause = (err as Error).cause as Error | undefined;
        const detail = [(err as Error).message, cause?.message].filter(Boolean).join(': ');
        throw new CodegenError(`GET ${url.origin}${url.pathname} failed: ${detail}`);
      }
      if (res.status === 429) {
        if (retries >= RETRY_POLICY.maxRetries) {
          throw new CodegenError(
            `GET ${url.pathname}: still rate limited after ${RETRY_POLICY.maxRetries} retries${await errorDetail(res)}`,
          );
        }
        await this.deps.sleep(rateLimitWait(res.headers, retries, this.deps.now()) + this.deps.random() * RETRY_POLICY.jitterMs);
        continue;
      }
      if (!res.ok) {
        throw new CodegenError(`GET ${url.pathname} failed: HTTP ${res.status}${await errorDetail(res)}`);
      }
      try {
        return (await res.json()) as T;
      } catch (err) {
        throw new CodegenError(`GET ${url.pathname}: response is not valid JSON (${(err as Error).message})`);
      }
    }
  }
}

export const RETRY_POLICY = {
  maxRetries: 5,
  /** First backoff wait when the response has no rate-limit headers; doubles each retry. */
  backoffBaseMs: 1000,
  backoffMaxMs: 30_000,
  /** A random 0..jitterMs is added to every wait. */
  jitterMs: 1000,
};

/**
 * Milliseconds to wait before retrying a 429, before jitter: `Retry-After`
 * (seconds), else the later of the epoch-ms reset headers, else exponential
 * backoff for the `retries`-th retry.
 */
function rateLimitWait(headers: Headers, retries: number, now: number): number {
  const retryAfter = headers.get('Retry-After');
  if (retryAfter !== null) {
    const seconds = Number(retryAfter.trim());
    if (retryAfter.trim() !== '' && Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const date = Date.parse(retryAfter); // RFC 9110 also allows an HTTP-date
    if (!Number.isNaN(date)) return Math.max(0, date - now);
  }
  const resets = ['X-Ratelimit-Reset', 'X-Ratelimit-Auth-Token-Reset']
    .map((name) => Number(headers.get(name) ?? NaN))
    .filter((ms) => Number.isFinite(ms));
  if (resets.length > 0) return Math.max(0, Math.max(...resets) - now);
  return Math.min(RETRY_POLICY.backoffMaxMs, RETRY_POLICY.backoffBaseMs * 2 ** retries);
}

/** `: <code>: <message>` from an API error body `{code, message}`, if it has one. */
async function errorDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { code?: unknown; message?: unknown };
    const parts = [body.code, body.message].filter((p): p is string => typeof p === 'string' && p !== '');
    return parts.length ? ` (${parts.join(': ')})` : '';
  } catch {
    return '';
  }
}
