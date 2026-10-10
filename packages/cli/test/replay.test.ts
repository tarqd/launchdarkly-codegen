/**
 * Replaying a snapshot (`--from-snapshot`) against the resolved config
 * (DESIGN.md → CLI, Fetcher): the snapshot fixes the project, base URI and
 * selection it was fetched with, so a config that disagrees is reported.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { projectDir, runCli, SNAPSHOTS_DIR } from './helpers.js';

// projectKey my-project, baseUri https://app.launchdarkly.com, no selection.
const unfiltered = join(SNAPSHOTS_DIR, 'boolean-flags.json');
const target = { id: 'ts-server', out: 'flags.ts', sdkMajor: 9 };

async function replay(config: object, snapshot: string, args: string[] = [], env: Record<string, string> = {}) {
  const dir = await projectDir({ project: 'my-project', targets: [target], ...config });
  const result = await runCli(['generate', '--from-snapshot', snapshot, ...args], dir, { env });
  return { result, dir };
}

describe('project mismatch', () => {
  it.each([
    ['the config file', { project: 'other' }, [], {}],
    ['LD_CODEGEN_PROJECT', {}, [], { LD_CODEGEN_PROJECT: 'other' }],
    ['--project', {}, ['--project', 'other'], {}],
  ])('exits 2 naming both projects when %s differs from the snapshot', async (_name, config, args, env) => {
    const { result, dir } = await replay(config, unfiltered, args, env);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/project `other`.*snapshot.*`my-project`/);
    await expect(readFile(join(dir, 'flags.ts'))).rejects.toThrow();
  });

  it('check exits 2 too, never 1', async () => {
    const dir = await projectDir({ project: 'other', targets: [target] });
    const result = await runCli(['check', '--from-snapshot', unfiltered], dir);
    expect(result.exitCode).toBe(2);
  });
});

describe('base URI mismatch', () => {
  const EU = 'https://app.eu.launchdarkly.com';

  it.each([
    ['the config file', { baseUri: EU }, [], {}],
    ['LD_BASE_URI', {}, [], { LD_BASE_URI: EU }],
    ['--base-uri', {}, ['--base-uri', EU], {}],
  ])('warns naming both when %s differs, and still uses the snapshot base URI', async (_name, config, args, env) => {
    const { dir: plainDir } = await replay({}, unfiltered);
    const { result, dir } = await replay(config, unfiltered, args, env);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toMatch(
      /^warning: base URI `https:\/\/app\.eu\.launchdarkly\.com`.*snapshot.*`https:\/\/app\.launchdarkly\.com`/,
    );
    expect(await readFile(join(dir, 'flags.ts'), 'utf8')).toBe(await readFile(join(plainDir, 'flags.ts'), 'utf8'));
  });

  it('does not warn when the base URI is only the default', async () => {
    // doc-comments.json was recorded against the EU instance.
    const snapshot = join(SNAPSHOTS_DIR, 'doc-comments.json');
    const dir = await projectDir({ project: 'storefront', targets: [target] });
    const result = await runCli(['generate', '--from-snapshot', snapshot], dir);
    expect(result).toMatchObject({ exitCode: 0, stderr: '' });
  });

  it('does not warn when an explicit base URI matches up to trailing slashes', async () => {
    const { result } = await replay({ baseUri: 'https://app.launchdarkly.com/' }, unfiltered);
    expect(result).toMatchObject({ exitCode: 0, stderr: '' });
  });
});

describe('selection recorded in the snapshot', () => {
  it('exits 2 when a snapshot recorded with a view is replayed with --tag', async () => {
    const { result } = await replay({}, join(SNAPSHOTS_DIR, 'view-filter.json'), ['--tag', 'checkout']);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/`view` and `tags` cannot both be set/);
  });

  it('exits 2 when a snapshot recorded with tags is replayed with --view', async () => {
    const { result } = await replay({}, join(SNAPSHOTS_DIR, 'tag-filter.json'), ['--view', 'checkout']);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/`view` and `tags` cannot both be set/);
  });

  it('still replays a view snapshot with its own --view, and a tag snapshot with extra --tag', async () => {
    expect((await replay({}, join(SNAPSHOTS_DIR, 'view-filter.json'), ['--view', 'checkout'])).result.exitCode).toBe(0);
    expect((await replay({}, join(SNAPSHOTS_DIR, 'tag-filter.json'), ['--tag', 'checkout'])).result.exitCode).toBe(0);
  });
});
