/**
 * Test builders shared by every package's tests: API flags and snapshots
 * (the normalizer's and fetcher's input), Flag model entries (an emitter's
 * input) and JSON responses for fake transports.
 */
import type { ApiFlag, Flag, Snapshot } from '../src/index.js';

export const BASE_URI = 'https://app.launchdarkly.com';
export const PROJECT_KEY = 'my-project';

/** A flags-list item: a boolean flag named after its key, unless `extra` says otherwise. */
export function apiFlag(key: string, extra: Partial<ApiFlag> = {}): ApiFlag {
  return {
    key,
    name: key,
    kind: 'boolean',
    variations: [{ value: true }, { value: false }],
    archived: false,
    deprecated: false,
    tags: [],
    ...extra,
  };
}

/** A multivariate flags-list item with these variation values. */
export function multivariateFlag(key: string, values: unknown[], extra: Partial<ApiFlag> = {}): ApiFlag {
  return apiFlag(key, { kind: 'multivariate', variations: values.map((value) => ({ value })), ...extra });
}

/** `customProperties` with one property. */
export function customProperty(name: string, value: string[]): NonNullable<ApiFlag['customProperties']> {
  return { [name]: { name, value } };
}

/** A snapshot of `my-project` whose flags-list pages hold these items. */
export function snapshotOf(...pages: ApiFlag[][]): Snapshot {
  return {
    snapshotVersion: 1,
    projectKey: PROJECT_KEY,
    baseUri: BASE_URI,
    flagPages: pages.map((items) => ({ items, totalCount: items.length })),
  };
}

/** A Flag model entry: a boolean flag in `my-project` named after its key. */
export function modelFlag(key: string, extra: Partial<Flag> = {}): Flag {
  return {
    key,
    name: key,
    description: '',
    kind: 'boolean',
    clientSideAvailability: { usingEnvironmentId: false, usingMobileKey: true },
    tags: [],
    deprecated: false,
    archived: false,
    aliases: {},
    uiUrl: `${BASE_URI}/projects/${PROJECT_KEY}/flags/${key}`,
    ...extra,
  };
}

/** A JSON API response. */
export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}
