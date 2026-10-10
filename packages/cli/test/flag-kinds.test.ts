import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { projectDir, runCli } from './helpers.js';

const config = {
  project: 'my-project',
  targets: [{ id: 'ts-server', out: 'flags.ts', sdkMajor: 9 }],
};

function flag(key: string, kind: 'boolean' | 'multivariate', values: unknown[], extra: object = {}) {
  return {
    key,
    name: key,
    kind,
    variations: values.map((value) => ({ value })),
    archived: false,
    deprecated: false,
    tags: [],
    ...extra,
  };
}

function numberProp(value: string[]) {
  return { customProperties: { 'codegen.number': { name: 'codegen.number', value } } };
}

/** A project dir holding the config and a snapshot with `items`; returns [dir, snapshotPath]. */
async function withSnapshot(items: object[]): Promise<[string, string]> {
  const dir = await projectDir(config);
  const path = join(dir, 'snapshot.json');
  const snapshot = {
    snapshotVersion: 1,
    projectKey: 'my-project',
    baseUri: 'https://app.launchdarkly.com',
    flagPages: [{ items }],
  };
  await writeFile(path, JSON.stringify(snapshot));
  return [dir, path];
}

describe('generate: flag kinds', () => {
  it('prints a warning naming a flag with mixed values and still generates it as json', async () => {
    const [dir, snap] = await withSnapshot([flag('mixed-values', 'multivariate', ['a', 1])]);
    const result = await runCli(['generate', '--from-snapshot', snap], dir);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe(
      'warning: flag mixed-values: variations mix value types (string, number); treating it as json\n',
    );
  });

  it('exits 2 naming a boolean flag with a non-boolean value', async () => {
    const [dir, snap] = await withSnapshot([flag('bad-bool', 'boolean', [true, 'nope'])]);
    const result = await runCli(['generate', '--from-snapshot', snap], dir);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('bad-bool');
  });

  it('exits 2 naming the flag and value when codegen.number int does not fit', async () => {
    const [dir, snap] = await withSnapshot([flag('big-number', 'multivariate', [1, 3000000000], numberProp(['int']))]);
    const result = await runCli(['generate', '--from-snapshot', snap], dir);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('big-number');
    expect(result.stderr).toContain('3000000000');
  });

  it('exits 2 naming the flag and property when codegen.number has several values', async () => {
    const [dir, snap] = await withSnapshot([flag('two-values', 'multivariate', [1], numberProp(['int', 'int']))]);
    const result = await runCli(['generate', '--from-snapshot', snap], dir);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('two-values');
    expect(result.stderr).toContain('codegen.number');
  });
});
