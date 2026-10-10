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
  /** Tag filter: only flags with all of these tags. Empty or absent means no filter. */
  tags?: readonly string[];
  /** View key: only flags linked to this view. Absent means no view. */
  view?: string;
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
/** The views API is beta; every views call must send this or gets a 403. */
export const VIEWS_API_VERSION = 'beta';
/** The server rejects a larger `limit` on linked flags (checked live, 2026-10-10). */
export const VIEW_MEMBERS_PAGE_LIMIT = 100;

/**
 * Fetches the view's member keys (if a view is set), then the project's flags
 * list, page by page, into a snapshot. Members come first so an unknown view
 * fails before the larger flags fetch.
 */
export async function fetchSnapshot(request: FetchRequest, deps: FetchDeps = defaultFetchDeps): Promise<Snapshot> {
  const client = new LdApiClient(request.baseUri, request.accessToken, deps);
  const view = request.view === undefined ? undefined : await fetchViewMembers(client, request, request.view);
  const flagPages = await client.getPages<ApiFlagsPage>(flagsListUrl(request), FLAGS_API_VERSION);
  return {
    snapshotVersion: SNAPSHOT_VERSION,
    projectKey: request.projectKey,
    baseUri: request.baseUri,
    ...(request.tags?.length ? { tags: [...request.tags] } : {}),
    ...(view && { view }),
    flagPages,
  };
}

/** One page of linked flags. Only these fields are read; the beta response may carry more. */
interface ViewMembersPage extends PagedBody {
  items?: { resourceKey?: unknown }[];
  totalCount?: number;
}

/**
 * Lists the view's linked flags with
 * `GET /api/v2/projects/{projectKey}/views/{viewKey}/linked/flags`. `_links`
 * is optional on this endpoint, so paging also stops at `totalCount` or an
 * empty page. Only `items[].resourceKey` is kept.
 */
async function fetchViewMembers(
  client: LdApiClient,
  request: FetchRequest,
  viewKey: string,
): Promise<{ key: string; memberKeys: string[] }> {
  const project = encodeURIComponent(request.projectKey);
  const url = apiUrl(request.baseUri, `/api/v2/projects/${project}/views/${encodeURIComponent(viewKey)}/linked/flags`);
  url.searchParams.set('limit', String(VIEW_MEMBERS_PAGE_LIMIT));
  let pages: ViewMembersPage[];
  try {
    pages = await client.getPages<ViewMembersPage>(url, VIEWS_API_VERSION, (page, all) => {
      const seen = all.reduce((n, p) => n + (p.items?.length ?? 0), 0);
      return (page.items?.length ?? 0) > 0 && (typeof page.totalCount !== 'number' || seen < page.totalCount);
    });
  } catch (err) {
    throw viewError(err, viewKey, request.projectKey);
  }
  const memberKeys = pages.flatMap((page, i) => {
    if (!Array.isArray(page.items)) {
      throw new CodegenError(`view \`${viewKey}\`: linked flags page ${i + 1} has no \`items\` list`);
    }
    return page.items.map((item) => {
      if (typeof item?.resourceKey !== 'string') {
        throw new CodegenError(`view \`${viewKey}\`: a linked flag on page ${i + 1} has no string \`resourceKey\``);
      }
      return item.resourceKey;
    });
  });
  return { key: viewKey, memberKeys };
}

/**
 * Maps the views API's errors to messages a user can act on. Checked live
 * (2026-10-10): an unknown view key is 404 `View not found` (keys are
 * case-sensitive), also in a project that has no views; an unknown project is
 * 404 `Project not found`. Views are an Enterprise feature; an account without
 * them could not be checked live, so any 403 is reported as views being
 * unavailable.
 */
function viewError(err: unknown, viewKey: string, projectKey: string): unknown {
  if (!(err instanceof ApiError)) return err;
  const detail = err.detail;
  if (err.status === 404 && /view/i.test(err.apiMessage ?? '')) {
    return new CodegenError(
      `view \`${viewKey}\` not found in project \`${projectKey}\`; \`view\` is a view key, not its display name, and is case-sensitive${detail}`,
    );
  }
  if (err.status === 403) {
    return new CodegenError(
      `views are not available for project \`${projectKey}\` with this access token (views need an Enterprise plan and a token that can read them)${detail}`,
    );
  }
  return err;
}

/**
 * The first flags-list URL. `env` and `expand` are never sent. Selection
 * params (the tag `filter`) are added here.
 */
export function flagsListUrl(request: FetchRequest): URL {
  const url = apiUrl(request.baseUri, `/api/v2/flags/${encodeURIComponent(request.projectKey)}`);
  url.searchParams.set('limit', String(FLAGS_PAGE_LIMIT));
  url.searchParams.set('sort', 'key');
  // `+` means "all of these tags"; URLSearchParams encodes it as %2B, as the API needs.
  if (request.tags?.length) url.searchParams.set('filter', `tags:${request.tags.join('+')}`);
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
        const body = await errorBody(res);
        throw new ApiError(res.status, url, body);
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

/** A non-2xx, non-429 API response. */
export class ApiError extends CodegenError {
  readonly apiCode: string | undefined;
  readonly apiMessage: string | undefined;
  constructor(
    readonly status: number,
    url: URL,
    body: { code?: string; message?: string },
  ) {
    super(`GET ${url.pathname} failed: HTTP ${status}${formatDetail(body)}`);
    this.apiCode = body.code;
    this.apiMessage = body.message;
  }
  /** ` (<code>: <message>)`, or '' when the body had neither. */
  get detail(): string {
    return formatDetail({ code: this.apiCode, message: this.apiMessage });
  }
}

function formatDetail(body: { code?: string | undefined; message?: string | undefined }): string {
  const parts = [body.code, body.message].filter((p): p is string => p !== undefined && p !== '');
  return parts.length ? ` (${parts.join(': ')})` : '';
}

/** `code` and `message` from an API error body `{code, message}`, where present. */
async function errorBody(res: Response): Promise<{ code?: string; message?: string }> {
  try {
    const body = (await res.json()) as { code?: unknown; message?: unknown };
    return {
      ...(typeof body.code === 'string' && { code: body.code }),
      ...(typeof body.message === 'string' && { message: body.message }),
    };
  } catch {
    return {};
  }
}

/** `: <code>: <message>` from an API error body, if it has one. */
async function errorDetail(res: Response): Promise<string> {
  return formatDetail(await errorBody(res));
}
