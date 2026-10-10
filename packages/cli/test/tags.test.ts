/**
 * Tag filtering (DESIGN.md → Fetcher, Normalizer rules, Configuration): the
 * `tags` setting from the config file, LD_CODEGEN_TAGS or repeatable --tag
 * narrows the generated wrapper live and from a snapshot.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generatedKeys, projectDir, runCli, SNAPSHOTS_DIR } from './helpers.js';

// Unfiltered: checkout-v2 [checkout, q3], beta.dark_mode [], AllowGuestCheckout [checkout]
// (and legacy-search, which is archived).
const unfiltered = join(SNAPSHOTS_DIR, 'boolean-flags.json');
const target = { id: 'ts-server', out: 'flags.ts', sdkMajor: 9 };
const ALL_KEYS = ['AllowGuestCheckout', 'beta.dark_mode', 'checkout-v2'];

async function generate(config: object, args: string[] = [], env: Record<string, string> = {}) {
  const dir = await projectDir({ project: 'my-project', targets: [target], ...config });
  const result = await runCli(['generate', '--from-snapshot', unfiltered, ...args], dir, { env });
  return { result, dir };
}

describe('tag filter on an unfiltered snapshot', () => {
  it('generates every flag without a tag filter', async () => {
    const { result, dir } = await generate({});
    expect(result).toMatchObject({ exitCode: 0, stderr: '' });
    expect(await generatedKeys(dir)).toEqual(ALL_KEYS);
  });

  it('--tag keeps only flags with that tag', async () => {
    const { result, dir } = await generate({}, ['--tag', 'checkout']);
    expect(result).toMatchObject({ exitCode: 0, stderr: '' });
    expect(await generatedKeys(dir)).toEqual(['AllowGuestCheckout', 'checkout-v2']);
  });

  it('repeated --tag keeps only flags with all of the tags', async () => {
    const { dir } = await generate({}, ['--tag', 'checkout', '--tag', 'q3']);
    expect(await generatedKeys(dir)).toEqual(['checkout-v2']);
  });

  it('reads `tags` from the config file', async () => {
    const { result, dir } = await generate({ tags: ['q3'] });
    expect(result).toMatchObject({ exitCode: 0, stderr: '' });
    expect(await generatedKeys(dir)).toEqual(['checkout-v2']);
  });

  it('LD_CODEGEN_TAGS is a comma-separated list', async () => {
    const { dir } = await generate({}, [], { LD_CODEGEN_TAGS: 'checkout, q3' });
    expect(await generatedKeys(dir)).toEqual(['checkout-v2']);
  });

  it('LD_CODEGEN_TAGS beats the file and --tag beats both, as a whole list', async () => {
    const env = { LD_CODEGEN_TAGS: 'checkout' };
    expect(await generatedKeys((await generate({ tags: ['q3'] }, [], env)).dir)).toEqual([
      'AllowGuestCheckout',
      'checkout-v2',
    ]);
    const cli = await generate({ tags: ['checkout'] }, ['--tag', 'q3'], { LD_CODEGEN_TAGS: 'checkout' });
    expect(await generatedKeys(cli.dir)).toEqual(['checkout-v2']);
  });

  it.each([
    ['a string', 'checkout'],
    ['an empty list', []],
    ['a list with a blank tag', ['checkout', ' ']],
    ['a list with a non-string', ['checkout', 3]],
  ])('rejects `tags` as %s with exit 2', async (_name, tags) => {
    const { result } = await generate({ tags });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/`tags` must be a non-empty list of non-blank strings/);
  });

  // `+` separates tags and `,` separates filters in `filter=tags:a+b`.
  it.each(['a+b', 'a,b'])('rejects the tag %j, which the API filter cannot express, with exit 2', async (tag) => {
    const { result, dir } = await generate({}, ['--tag', tag]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain(`tag ${JSON.stringify(tag)}`);
    await expect(readFile(join(dir, 'flags.ts'))).rejects.toThrow();
  });

  it('rejects a snapshot whose recorded `tags` is not a list of strings', async () => {
    const dir = await projectDir({ project: 'my-project', targets: [target] });
    const bad = join(dir, 'bad.json');
    await writeFile(bad, JSON.stringify({ ...JSON.parse(await readFile(unfiltered, 'utf8')), tags: 'checkout' }));
    const result = await runCli(['generate', '--from-snapshot', bad], dir);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/tags/);
  });
});

describe('tag filter on a live fetch', () => {
  it('sends filter=tags:a+b and records the tags in the snapshot', async () => {
    const recorded = await readFile(unfiltered, 'utf8');
    const urls: URL[] = [];
    // The server ignores the filter here, so the local re-check must do the work.
    const pages = (JSON.parse(recorded) as { flagPages: unknown[] }).flagPages;
    const fetch = async (input: string): Promise<Response> => {
      const url = new URL(input);
      urls.push(url);
      const offset = Number(url.searchParams.get('offset') ?? 0);
      return new Response(JSON.stringify(pages[offset / 2]), { headers: { 'content-type': 'application/json' } });
    };
    const dir = await projectDir({ project: 'my-project', targets: [target] });
    const io = { env: { LD_ACCESS_TOKEN: 'api-env' }, fetch };

    const result = await runCli(['snapshot', '--write-snapshot', 'snap.json', '--tag', 'checkout', '--tag', 'q3'], dir, io);
    expect(result).toMatchObject({ exitCode: 0, stderr: '' });
    expect(urls[0]!.search).toContain('filter=tags%3Acheckout%2Bq3');
    const snapshot = JSON.parse(await readFile(join(dir, 'snap.json'), 'utf8')) as { tags?: string[] };
    expect(snapshot.tags).toEqual(['checkout', 'q3']);

    expect(await runCli(['generate', '--tag', 'checkout', '--tag', 'q3'], dir, io)).toMatchObject({ exitCode: 0 });
    expect(await generatedKeys(dir)).toEqual(['checkout-v2']);
  });
});
