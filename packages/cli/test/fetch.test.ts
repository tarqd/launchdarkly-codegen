/**
 * `generate` and `snapshot` against the API, through a fake transport that
 * replays the flags-list pages recorded in fixtures/snapshots.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { projectDir, runCli, SNAPSHOTS_DIR } from './helpers.js';

const fixture = join(SNAPSHOTS_DIR, 'boolean-flags.json');
const recorded = JSON.parse(await readFile(fixture, 'utf8')) as { flagPages: { _links: { self: { href: string } } }[] };

const config = {
  project: 'my-project',
  targets: [{ id: 'ts-server', out: 'src/flags.generated.ts', sdkMajor: 9 }],
};

/** Serves each recorded page at the `offset` its `self` link names. */
function recordedApi() {
  const requests: { url: URL; headers: Headers }[] = [];
  const byOffset = new Map(
    recorded.flagPages.map((page) => [new URL(page._links.self.href, 'http://x').searchParams.get('offset'), page]),
  );
  const fetch = async (input: string, init?: RequestInit): Promise<Response> => {
    const url = new URL(input);
    requests.push({ url, headers: new Headers(init?.headers) });
    const page = byOffset.get(url.searchParams.get('offset') ?? '0');
    if (!url.pathname.endsWith('/api/v2/flags/my-project') || !page) {
      return new Response(JSON.stringify({ code: 'not_found', message: 'Invalid resource identifier' }), { status: 404 });
    }
    return new Response(JSON.stringify(page), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { fetch, requests };
}

const generated = (dir: string) => readFile(join(dir, 'src/flags.generated.ts'), 'utf8');

describe('live fetch from the CLI', () => {
  it('generate fetches the flags list and writes the same file as the recorded snapshot', async () => {
    const api = recordedApi();
    const live = await projectDir(config);
    const result = await runCli(['generate'], live, { env: { LD_ACCESS_TOKEN: 'api-env' }, fetch: api.fetch });
    expect(result).toMatchObject({ exitCode: 0, stderr: '' });
    expect(api.requests).toHaveLength(2);
    expect(api.requests[0]!.headers.get('Authorization')).toBe('api-env');

    const replay = await projectDir(config);
    await runCli(['generate', '--from-snapshot', fixture], replay);
    expect(await generated(live)).toBe(await generated(replay));
  });

  it('snapshot --write-snapshot records responses that generate --from-snapshot replays byte for byte', async () => {
    const dir = await projectDir(config);
    const io = { env: { LD_ACCESS_TOKEN: 'api-env' }, fetch: recordedApi().fetch };

    expect(await runCli(['generate'], dir, io)).toMatchObject({ exitCode: 0 });
    const live = await generated(dir);

    const result = await runCli(['snapshot', '--write-snapshot', 'snap/flags.json'], dir, io);
    expect(result).toMatchObject({ exitCode: 0, stderr: '' });
    const written = JSON.parse(await readFile(join(dir, 'snap/flags.json'), 'utf8'));
    expect(written.flagPages).toEqual(recorded.flagPages);
    expect(written).toMatchObject({ snapshotVersion: 1, projectKey: 'my-project', baseUri: 'https://app.launchdarkly.com' });

    const replay = await projectDir(config);
    expect(await runCli(['generate', '--from-snapshot', join(dir, 'snap/flags.json')], replay)).toMatchObject({
      exitCode: 0,
    });
    expect(await generated(replay)).toBe(live);
  });

  it('uses the resolved base URI for doc-comment UI links, live and on replay', async () => {
    const dir = await projectDir({ ...config, baseUri: 'https://config.example' });
    const env = { LD_ACCESS_TOKEN: 'api-env', LD_BASE_URI: 'https://app.eu.launchdarkly.com/' };
    const io = { env, fetch: recordedApi().fetch };

    expect(await runCli(['generate'], dir, io)).toMatchObject({ exitCode: 0 });
    const live = await generated(dir);
    expect(live).toContain('https://app.eu.launchdarkly.com/projects/my-project/flags/');
    expect(live).not.toContain('https://app.launchdarkly.com/');
    expect(live).not.toContain('config.example');

    expect(await runCli(['snapshot', '--write-snapshot', 'flags.json'], dir, io)).toMatchObject({ exitCode: 0 });
    const replay = await projectDir(config);
    await runCli(['generate', '--from-snapshot', join(dir, 'flags.json')], replay);
    expect(await generated(replay)).toBe(live);
  });

  it('--base-uri and --access-token beat LD_BASE_URI and LD_ACCESS_TOKEN', async () => {
    const api = recordedApi();
    const dir = await projectDir({ ...config, baseUri: 'https://config.example' });
    const env = { LD_ACCESS_TOKEN: 'api-env', LD_BASE_URI: 'https://env.example' };
    const args = ['snapshot', '--write-snapshot', 'flags.json'];
    const flags = ['--base-uri', 'https://app.eu.launchdarkly.com', '--access-token', 'api-flag'];
    expect(await runCli([...args, ...flags], dir, { env, fetch: api.fetch })).toMatchObject({ exitCode: 0 });
    expect(api.requests.map((r) => r.url.origin)).toEqual(Array(2).fill('https://app.eu.launchdarkly.com'));
    expect(api.requests.map((r) => r.headers.get('Authorization'))).toEqual(['api-flag', 'api-flag']);
    const written = JSON.parse(await readFile(join(dir, 'flags.json'), 'utf8'));
    expect(written.baseUri).toBe('https://app.eu.launchdarkly.com');

    // Without the flags, the env vars win over the config.
    const fromEnv = recordedApi();
    expect(await runCli(args, dir, { env, fetch: fromEnv.fetch })).toMatchObject({ exitCode: 0 });
    expect(fromEnv.requests[0]!.url.origin).toBe('https://env.example');
    expect(fromEnv.requests[0]!.headers.get('Authorization')).toBe('api-env');
  });

  it('ignores an access token in the config: exit 2 without one', async () => {
    const api = recordedApi();
    const dir = await projectDir({ ...config, accessToken: 'api-config' });
    const result = await runCli(['generate'], dir, { env: {}, fetch: api.fetch });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('LD_ACCESS_TOKEN');
    expect(api.requests).toHaveLength(0);
  });

  it('exits 2 with the API error, writing nothing', async () => {
    const api = recordedApi();
    const dir = await projectDir({ ...config, project: 'nope' });
    const result = await runCli(['snapshot', '--write-snapshot', 'flags.json'], dir, {
      env: { LD_ACCESS_TOKEN: 'api-env' },
      fetch: api.fetch,
    });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('404');
    expect(result.stderr).toContain('Invalid resource identifier');
    await expect(readFile(join(dir, 'flags.json'))).rejects.toThrow();
  });

  it('snapshot requires --write-snapshot', async () => {
    const result = await runCli(['snapshot'], await projectDir(config), { env: { LD_ACCESS_TOKEN: 't' } });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('--write-snapshot');
  });
});
