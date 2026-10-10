import { describe, expect, it } from 'vitest';
import { CodegenError, fetchSnapshot, normalize, type ApiFlag, type FetchDeps } from '../src/index.js';

const BASE = 'https://app.launchdarkly.com';

function flag(key: string): ApiFlag {
  return {
    key,
    name: key,
    kind: 'boolean',
    variations: [{ value: true }, { value: false }],
    archived: false,
    deprecated: false,
    tags: [],
  };
}

/** A response body shaped like `GET /api/v2/flags/{projectKey}` (LD-API-Version 20240415). */
function page(keys: string[], next?: string) {
  const links: Record<string, { href: string; type: string }> = {
    self: { href: '/api/v2/flags/my-project?limit=100&sort=key', type: 'application/json' },
  };
  if (next) links.next = { href: next, type: 'application/json' };
  return { items: keys.map(flag), totalCount: 3, _links: links };
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

/** A fake transport that replays `responses` in order and records each request. */
function fakeApi(...responses: (Response | Error)[]) {
  const requests: { url: URL; headers: Headers }[] = [];
  const sleeps: number[] = [];
  const deps: FetchDeps = {
    fetch: async (input, init) => {
      requests.push({ url: new URL(String(input)), headers: new Headers(init?.headers) });
      const next = responses.shift();
      if (next === undefined) throw new Error('unexpected request');
      if (next instanceof Error) throw next;
      return next;
    },
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    now: () => 1_700_000_000_000,
    random: () => 0.5,
  };
  return { deps, requests, sleeps };
}

const request = { projectKey: 'my-project', baseUri: BASE, accessToken: 'api-123' };

describe('fetchSnapshot', () => {
  it('lists flags with the pinned API version, limit=100 sorted by key, and the token', async () => {
    const api = fakeApi(json(page(['a', 'b'])));
    const snapshot = await fetchSnapshot(request, api.deps);

    expect(api.requests).toHaveLength(1);
    const { url, headers } = api.requests[0]!;
    expect(url.origin + url.pathname).toBe(`${BASE}/api/v2/flags/my-project`);
    expect(url.searchParams.get('limit')).toBe('100');
    expect(url.searchParams.get('sort')).toBe('key');
    expect(headers.get('LD-API-Version')).toBe('20240415');
    expect(headers.get('Authorization')).toBe('api-123');
    expect(snapshot).toEqual({
      snapshotVersion: 1,
      projectKey: 'my-project',
      baseUri: BASE,
      flagPages: [page(['a', 'b'])],
    });
  });

  it('follows _links.next (relative or absolute) until it is absent, keeping every raw page', async () => {
    const p1 = page(['a', 'b'], '/api/v2/flags/my-project?limit=100&offset=100&sort=key');
    const p2 = page(['c', 'd'], `${BASE}/api/v2/flags/my-project?limit=100&offset=200&sort=key`);
    const p3 = page(['e']);
    const api = fakeApi(json(p1), json(p2), json(p3));
    const snapshot = await fetchSnapshot(request, api.deps);

    expect(snapshot.flagPages).toEqual([p1, p2, p3]);
    expect(api.requests.map((r) => r.url.searchParams.get('offset'))).toEqual([null, '100', '200']);
    for (const { url, headers } of api.requests) {
      expect(url.origin).toBe(BASE);
      expect(url.searchParams.has('env')).toBe(false);
      expect(url.searchParams.has('expand')).toBe(false);
      expect(headers.get('LD-API-Version')).toBe('20240415');
    }
  });

  it('keeps a flag duplicated across pages in the raw pages; the model has it once', async () => {
    // Offset paging repeats a flag when one is created mid-fetch.
    const p1 = page(['a', 'b'], '/api/v2/flags/my-project?limit=100&offset=100&sort=key');
    const p2 = page(['b', 'c']);
    const snapshot = await fetchSnapshot(request, fakeApi(json(p1), json(p2)).deps);

    expect(snapshot.flagPages).toEqual([p1, p2]);
    expect(normalize(snapshot).flags.map((f) => f.key)).toEqual(['a', 'b', 'c']);
  });

  describe('on 429', () => {
    const NOW = 1_700_000_000_000;
    const limited = (headers: Record<string, string> = {}) =>
      json({ code: 'rate_limited', message: "You've exceeded the API rate limit. Try again later." }, 429, headers);

    // Jitter is random() * 1s; the fake random() is 0.5, so every wait has +500ms.
    it('waits Retry-After seconds, plus jitter, then retries', async () => {
      const api = fakeApi(limited({ 'Retry-After': '3', 'X-Ratelimit-Reset': String(NOW + 9000) }), json(page(['a'])));
      const snapshot = await fetchSnapshot(request, api.deps);
      expect(api.sleeps).toEqual([3500]);
      expect(api.requests).toHaveLength(2);
      expect(snapshot.flagPages).toEqual([page(['a'])]);
    });

    it('otherwise waits until the later of the epoch-ms reset headers', async () => {
      const api = fakeApi(
        limited({ 'X-Ratelimit-Reset': String(NOW + 2000), 'X-Ratelimit-Auth-Token-Reset': String(NOW + 4000) }),
        limited({ 'X-Ratelimit-Auth-Token-Reset': String(NOW + 1000) }),
        limited({ 'X-Ratelimit-Reset': String(NOW - 5000) }), // clock skew: already past
        json(page(['a'])),
      );
      await fetchSnapshot(request, api.deps);
      expect(api.sleeps).toEqual([4500, 1500, 500]);
    });

    it('otherwise backs off exponentially from 1s', async () => {
      const api = fakeApi(limited(), limited(), limited(), json(page(['a'])));
      await fetchSnapshot(request, api.deps);
      expect(api.sleeps).toEqual([1500, 2500, 4500]);
    });

    it('gives up after 5 retries with an exit-2 error', async () => {
      const api = fakeApi(...Array.from({ length: 6 }, () => limited({ 'Retry-After': '1' })));
      const err = await fetchSnapshot(request, api.deps).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(CodegenError);
      expect((err as CodegenError).exitCode).toBe(2);
      expect((err as CodegenError).message).toMatch(/rate limit/i);
      expect((err as CodegenError).message).toContain('5 retries');
      expect(api.requests).toHaveLength(6);
      expect(api.sleeps).toHaveLength(5);
    });
  });

  it('turns an API error into an exit-2 error with the status, code and message', async () => {
    const api = fakeApi(json({ code: 'not_found', message: 'Invalid resource identifier' }, 404));
    const err = await fetchSnapshot(request, api.deps).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CodegenError);
    expect((err as CodegenError).message).toContain('/api/v2/flags/my-project');
    expect((err as CodegenError).message).toContain('404');
    expect((err as CodegenError).message).toContain('not_found: Invalid resource identifier');
  });

  it('turns a network failure into an exit-2 error with the cause', async () => {
    const api = fakeApi(new TypeError('fetch failed: getaddrinfo ENOTFOUND app.launchdarkly.com'));
    const err = await fetchSnapshot(request, api.deps).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CodegenError);
    expect((err as CodegenError).message).toContain('ENOTFOUND');
  });

  it('never puts the access token in an error message', async () => {
    const api = fakeApi(json({ code: 'unauthorized', message: 'Invalid access token' }, 401));
    const err = (await fetchSnapshot(request, api.deps).catch((e: unknown) => e)) as Error;
    expect(err.message).toContain('401');
    expect(err.message).not.toContain('api-123');
  });

  it('accepts a base URI with a trailing slash or a path-less EU instance', async () => {
    const api = fakeApi(json(page(['a'])));
    await fetchSnapshot({ ...request, baseUri: 'https://app.eu.launchdarkly.com/' }, api.deps);
    expect(api.requests[0]!.url.href).toMatch(/^https:\/\/app\.eu\.launchdarkly\.com\/api\/v2\/flags\/my-project\?/);
  });
});

describe('fetchSnapshot with a tag filter', () => {
  it('sends filter=tags:a+b with the + percent-encoded, and records the tags in the snapshot', async () => {
    const api = fakeApi(json(page(['a'])));
    const snapshot = await fetchSnapshot({ ...request, tags: ['checkout', 'billing'] }, api.deps);

    const { url } = api.requests[0]!;
    expect(url.searchParams.get('filter')).toBe('tags:checkout+billing');
    // A literal `+` in a query string decodes as a space; the API needs %2B.
    expect(url.search).toContain('filter=tags%3Acheckout%2Bbilling');
    expect(snapshot.tags).toEqual(['checkout', 'billing']);
  });

  it('sends no filter and records no tags when none are configured', async () => {
    const api = fakeApi(json(page(['a'])));
    const snapshot = await fetchSnapshot({ ...request, tags: [] }, api.deps);
    expect(api.requests[0]!.url.searchParams.has('filter')).toBe(false);
    expect(snapshot).not.toHaveProperty('tags');
  });
});

/**
 * A page of `GET /api/v2/projects/{projectKey}/views/{viewKey}/linked/flags`
 * (LD-API-Version beta), shaped like a live response recorded 2026-10-10:
 * `_links` has `next`/`last` only when there are more pages.
 */
function viewPage(keys: string[], { offset = 0, limit = 100, total = keys.length } = {}) {
  const path = '/api/v2/projects/my-project/views/payments/linked/flags';
  const links: Record<string, { href: string; type: string }> = {
    self: { href: `${path}?limit=${limit}${offset ? `&offset=${offset}` : ''}`, type: 'application/json' },
  };
  if (offset + limit < total) {
    links.next = { href: `${path}?limit=${limit}&offset=${offset + limit}`, type: 'application/json' };
    links.last = { href: `${path}?limit=${limit}&offset=${Math.floor((total - 1) / limit) * limit}`, type: 'application/json' };
  }
  return {
    _links: links,
    items: keys.map((resourceKey, i) => ({
      _links: { self: { href: `/api/v2/flags/my-project/${resourceKey}`, type: 'application/json' } },
      linkedAt: 1_760_000_000_000 + i,
      resourceKey,
      resourceType: 'flag',
    })),
    totalCount: total,
  };
}

describe('fetchSnapshot with a view', () => {
  const viewRequest = { ...request, view: 'payments' };

  it('lists the view members with LD-API-Version: beta, then the flags list, and records both', async () => {
    const api = fakeApi(json(viewPage(['b', 'a'])), json(page(['a', 'b', 'c'])));
    const snapshot = await fetchSnapshot(viewRequest, api.deps);

    const [members, flags] = api.requests;
    expect(members!.url.origin + members!.url.pathname).toBe(
      `${BASE}/api/v2/projects/my-project/views/payments/linked/flags`,
    );
    expect(members!.url.searchParams.get('limit')).toBe('100');
    expect(members!.headers.get('LD-API-Version')).toBe('beta');
    expect(members!.headers.get('Authorization')).toBe('api-123');
    // The flags list is unfiltered: the undocumented filter=view: is not used.
    expect(flags!.url.pathname).toBe('/api/v2/flags/my-project');
    expect(flags!.url.searchParams.has('filter')).toBe(false);
    expect(flags!.headers.get('LD-API-Version')).toBe('20240415');
    expect(snapshot.view).toEqual({ key: 'payments', memberKeys: ['b', 'a'] });
    expect(snapshot.flagPages).toEqual([page(['a', 'b', 'c'])]);
  });

  it('pages the members by _links.next', async () => {
    const api = fakeApi(
      json(viewPage(['a', 'b'], { limit: 2, total: 5 })),
      json(viewPage(['c', 'd'], { offset: 2, limit: 2, total: 5 })),
      json(viewPage(['e'], { offset: 4, limit: 2, total: 5 })),
      json(page(['a'])),
    );
    const snapshot = await fetchSnapshot(viewRequest, api.deps);
    expect(api.requests.slice(0, 3).map((r) => r.url.searchParams.get('offset'))).toEqual([null, '2', '4']);
    expect(api.requests.slice(0, 3).every((r) => r.headers.get('LD-API-Version') === 'beta')).toBe(true);
    expect(snapshot.view?.memberKeys).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('stops paging the members once totalCount is reached, even if _links.next is present', async () => {
    const full = viewPage(['a', 'b'], { limit: 2, total: 2 });
    full._links.next = { href: '/api/v2/projects/my-project/views/payments/linked/flags?limit=2&offset=2', type: 'application/json' };
    const api = fakeApi(json(full), json(page(['a'])));
    const snapshot = await fetchSnapshot(viewRequest, api.deps);
    expect(api.requests).toHaveLength(2);
    expect(snapshot.view?.memberKeys).toEqual(['a', 'b']);
  });

  it('stops paging the members on an empty page', async () => {
    const empty = viewPage([], { offset: 2, limit: 2, total: 9 });
    empty._links.next = { href: '/api/v2/projects/my-project/views/payments/linked/flags?limit=2&offset=4', type: 'application/json' };
    const api = fakeApi(json(viewPage(['a', 'b'], { limit: 2, total: 9 })), json(empty), json(page(['a'])));
    const snapshot = await fetchSnapshot(viewRequest, api.deps);
    expect(api.requests).toHaveLength(3);
    expect(snapshot.view?.memberKeys).toEqual(['a', 'b']);
  });

  it('reads only resourceKey from member items, ignoring unknown fields and a missing _links', async () => {
    const body = {
      items: [
        { resourceKey: 'a', resourceType: 'flag', linkedAt: 1, _links: {}, resourceDetails: { name: 'A' }, futureField: [1] },
        { resourceKey: 'b', somethingNew: true },
      ],
      totalCount: 2,
      newTopLevel: { x: 1 },
    };
    const snapshot = await fetchSnapshot(viewRequest, fakeApi(json(body), json(page(['a']))).deps);
    expect(snapshot.view).toEqual({ key: 'payments', memberKeys: ['a', 'b'] });
  });

  it('URL-encodes the view key and keeps its case', async () => {
    const api = fakeApi(json(viewPage([])), json(page([])));
    await fetchSnapshot({ ...request, view: 'Team A' }, api.deps);
    expect(api.requests[0]!.url.pathname).toBe('/api/v2/projects/my-project/views/Team%20A/linked/flags');
  });

  it('rejects a member item without a string resourceKey as exit 2', async () => {
    const err = await fetchSnapshot(viewRequest, fakeApi(json({ items: [{ key: 'a' }], totalCount: 1 })).deps).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(CodegenError);
    expect((err as Error).message).toMatch(/resourceKey/);
  });

  // Live, 2026-10-10: an unknown view key returns 404 {"code":"not_found","message":"View not found"}.
  it('turns 404 View not found into an exit-2 error naming the view and project', async () => {
    const api = fakeApi(json({ code: 'not_found', message: 'View not found' }, 404));
    const err = await fetchSnapshot(viewRequest, api.deps).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CodegenError);
    expect((err as CodegenError).exitCode).toBe(2);
    const message = (err as Error).message;
    expect(message).toContain('view `payments` not found in project `my-project`');
    expect(message).toMatch(/view key, not its display name/);
    expect(message).toContain('not_found: View not found');
    expect(api.requests).toHaveLength(1);
  });

  // An account without views was not verifiable live; a 403 means views are not available.
  it('turns a 403 into an exit-2 error saying views need an Enterprise plan', async () => {
    const api = fakeApi(json({ code: 'forbidden', message: 'Access to the requested resource was denied' }, 403));
    const err = await fetchSnapshot(viewRequest, api.deps).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CodegenError);
    expect((err as CodegenError).exitCode).toBe(2);
    expect((err as Error).message).toMatch(/views are not available/);
    expect((err as Error).message).toMatch(/Enterprise/);
    expect((err as Error).message).toContain('forbidden: Access to the requested resource was denied');
  });

  it('keeps the generic error for a 404 that is not about the view (unknown project)', async () => {
    const api = fakeApi(json({ code: 'not_found', message: 'Project not found' }, 404));
    const err = (await fetchSnapshot(viewRequest, api.deps).catch((e: unknown) => e)) as Error;
    expect(err).toBeInstanceOf(CodegenError);
    expect(err.message).toContain('404');
    expect(err.message).toContain('not_found: Project not found');
    expect(err.message).not.toMatch(/view `payments` not found/);
  });
});
