/**
 * View filtering (DESIGN.md → Fetcher, Normalizer rules, Configuration): the
 * `view` setting from the config file, LD_CODEGEN_VIEW or --view narrows the
 * generated wrapper to the view's linked flags, live and from a snapshot.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { jsonResponse } from '../../core/test/builders.js';
import { generatedKeys, projectDir, runCli, SNAPSHOTS_DIR } from './helpers.js';

// Flags: checkout-v2, beta.dark_mode, AllowGuestCheckout (and legacy-search, archived).
const unfiltered = join(SNAPSHOTS_DIR, 'boolean-flags.json');
const target = { id: 'ts-server', out: 'flags.ts', sdkMajor: 9 };
const VIEWS_PATH = '/api/v2/projects/my-project/views/';

/**
 * A fake LaunchDarkly API: the flags list from boolean-flags.json and, for
 * `views[key]`, a linked-flags list paged two at a time; any other view is a
 * 404 as the live API returns it.
 */
async function fakeApi(views: Record<string, string[]>) {
  const pages = (JSON.parse(await readFile(unfiltered, 'utf8')) as { flagPages: unknown[] }).flagPages;
  const requests: { url: URL; apiVersion: string | null }[] = [];
  const fetch = async (input: string, init?: RequestInit): Promise<Response> => {
    const url = new URL(input);
    const apiVersion = new Headers(init?.headers).get('LD-API-Version');
    requests.push({ url, apiVersion });
    const offset = Number(url.searchParams.get('offset') ?? 0);
    if (!url.pathname.startsWith(VIEWS_PATH)) return jsonResponse(pages[offset / 2]);
    if (apiVersion !== 'beta') {
      return jsonResponse({ code: 'forbidden', message: 'This API is in beta. To use it, your request must include the header `LD-API-Version: beta`.' }, 403);
    }
    const viewKey = decodeURIComponent(url.pathname.slice(VIEWS_PATH.length).split('/')[0]!);
    const members = views[viewKey];
    if (members === undefined) return jsonResponse({ code: 'not_found', message: 'View not found' }, 404);
    const base = `${url.pathname}?limit=2`;
    const _links: Record<string, { href: string; type: string }> = {
      self: { href: offset ? `${base}&offset=${offset}` : base, type: 'application/json' },
    };
    if (offset + 2 < members.length) _links.next = { href: `${base}&offset=${offset + 2}`, type: 'application/json' };
    const items = members.slice(offset, offset + 2).map((resourceKey) => ({
      _links: {},
      linkedAt: 1_760_000_000_000,
      resourceKey,
      resourceType: 'flag',
    }));
    return jsonResponse({ _links, items, totalCount: members.length });
  };
  return { fetch, requests };
}

const ENV = { LD_ACCESS_TOKEN: 'api-env' };

describe('view on a live fetch', () => {
  const VIEWS = { payments: ['AllowGuestCheckout', 'checkout-v2', 'deleted-flag'] };

  it('--view generates only the view members, without filter=view:', async () => {
    const api = await fakeApi(VIEWS);
    const dir = await projectDir({ project: 'my-project', targets: [target] });
    const result = await runCli(['generate', '--view', 'payments'], dir, { env: ENV, fetch: api.fetch });
    expect(result).toMatchObject({ exitCode: 0, stderr: '' });
    expect(await generatedKeys(dir)).toEqual(['AllowGuestCheckout', 'checkout-v2']);
    expect(api.requests.filter((r) => r.url.pathname.startsWith(VIEWS_PATH))).toHaveLength(2);
    expect(api.requests.every((r) => !r.url.searchParams.has('filter'))).toBe(true);
  });

  it('reads `view` from the config file and LD_CODEGEN_VIEW, with the CLI winning', async () => {
    const api = await fakeApi({ ...VIEWS, guests: ['AllowGuestCheckout'], dark: ['beta.dark_mode'] });
    const dir = await projectDir({ project: 'my-project', view: 'guests', targets: [target] });
    expect(await runCli(['generate'], dir, { env: ENV, fetch: api.fetch })).toMatchObject({ exitCode: 0 });
    expect(await generatedKeys(dir)).toEqual(['AllowGuestCheckout']);
    const env = { ...ENV, LD_CODEGEN_VIEW: 'dark' };
    expect(await runCli(['generate'], dir, { env, fetch: api.fetch })).toMatchObject({ exitCode: 0 });
    expect(await generatedKeys(dir)).toEqual(['beta.dark_mode']);
    expect(await runCli(['generate', '--view', 'payments'], dir, { env, fetch: api.fetch })).toMatchObject({ exitCode: 0 });
    expect(await generatedKeys(dir)).toEqual(['AllowGuestCheckout', 'checkout-v2']);
  });

  it('records the view key and member keys, and the snapshot replays the same selection offline', async () => {
    const api = await fakeApi(VIEWS);
    const dir = await projectDir({ project: 'my-project', targets: [target] });
    const snap = await runCli(['snapshot', '--write-snapshot', 'snap.json', '--view', 'payments'], dir, {
      env: ENV,
      fetch: api.fetch,
    });
    expect(snap).toMatchObject({ exitCode: 0, stderr: '' });
    const snapshot = JSON.parse(await readFile(join(dir, 'snap.json'), 'utf8')) as { view?: unknown };
    expect(snapshot.view).toEqual({ key: 'payments', memberKeys: VIEWS.payments });

    // No token and no fetch: the replay is offline.
    for (const args of [[], ['--view', 'payments']]) {
      const result = await runCli(['generate', '--from-snapshot', 'snap.json', ...args], dir);
      expect(result).toMatchObject({ exitCode: 0, stderr: '' });
      expect(await generatedKeys(dir)).toEqual(['AllowGuestCheckout', 'checkout-v2']);
    }
  });

  it('exits 2 on an unknown view key, naming it, before fetching flags', async () => {
    const api = await fakeApi(VIEWS);
    const dir = await projectDir({ project: 'my-project', targets: [target] });
    const result = await runCli(['generate', '--view', 'Payments'], dir, { env: ENV, fetch: api.fetch });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('view `Payments` not found in project `my-project`');
    expect(result.stderr).toContain('View not found');
    expect(api.requests).toHaveLength(1);
    await expect(readFile(join(dir, 'flags.ts'))).rejects.toThrow();
  });

  it('exits 2 when the account has no access to views (403)', async () => {
    const dir = await projectDir({ project: 'my-project', targets: [target] });
    const fetch = async () => jsonResponse({ code: 'forbidden', message: 'Access to the requested resource was denied' }, 403);
    const result = await runCli(['generate', '--view', 'payments'], dir, { env: ENV, fetch });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/views are not available for project `my-project`.*Enterprise/);
  });
});

describe('view on a snapshot', () => {
  it('exits 2 when --view is set but the snapshot was fetched without a view', async () => {
    const dir = await projectDir({ project: 'my-project', targets: [target] });
    const result = await runCli(['generate', '--from-snapshot', unfiltered, '--view', 'payments'], dir);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/snapshot has no view/);
  });

  it.each([
    ['a string', 'payments'],
    ['no member keys', { key: 'payments' }],
    ['a non-string member key', { key: 'payments', memberKeys: [1] }],
  ])('rejects a snapshot whose recorded `view` has %s', async (_name, view) => {
    const dir = await projectDir({ project: 'my-project', targets: [target] });
    const bad = join(dir, 'bad.json');
    await writeFile(bad, JSON.stringify({ ...JSON.parse(await readFile(unfiltered, 'utf8')), view }));
    const result = await runCli(['generate', '--from-snapshot', bad], dir);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/`view` must be/);
  });
});

describe('view configuration', () => {
  it.each([
    ['both in the file', { view: 'payments', tags: ['checkout'] }, [], {}],
    ['--view with file tags', { tags: ['checkout'] }, ['--view', 'payments'], {}],
    ['LD_CODEGEN_VIEW with --tag', {}, ['--tag', 'checkout'], { LD_CODEGEN_VIEW: 'payments' }],
  ])('exits 2 when view and tags are both set (%s)', async (_name, config, args, env) => {
    const dir = await projectDir({ project: 'my-project', targets: [target], ...config });
    const result = await runCli(['generate', '--from-snapshot', unfiltered, ...args], dir, { env });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/`view` and `tags` cannot both be set/);
  });

  it('rejects an empty `view` in the config file', async () => {
    const dir = await projectDir({ project: 'my-project', view: '', targets: [target] });
    const result = await runCli(['generate', '--from-snapshot', unfiltered], dir);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/`view` must be a non-empty string/);
  });
});
