import { describe, expect, it } from 'vitest';
import type { ApiFlag } from '@launchtarqly/core';
import { apiFlag, customProperty, multivariateFlag } from '../../core/test/builders.js';
import { projectDir, runCli, writeSnapshot } from './helpers.js';

const config = {
  project: 'my-project',
  targets: [{ id: 'ts-server', out: 'flags.ts', sdkMajor: 9 }],
};

/** A project dir holding the config and a snapshot with `items`; returns [dir, snapshotPath]. */
async function withSnapshot(items: ApiFlag[]): Promise<[string, string]> {
  const dir = await projectDir(config);
  return [dir, await writeSnapshot(dir, items)];
}

const numberProp = (value: string[]) => ({ customProperties: customProperty('codegen.number', value) });

describe('generate: flag kinds', () => {
  it('prints a warning naming a flag with mixed values and still generates it as json', async () => {
    const [dir, snap] = await withSnapshot([multivariateFlag('mixed-values', ['a', 1])]);
    const result = await runCli(['generate', '--from-snapshot', snap], dir);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe(
      'warning: flag mixed-values: variations mix value types (string, number); treating it as json\n',
    );
  });

  it('exits 2 naming a boolean flag with a non-boolean value', async () => {
    const [dir, snap] = await withSnapshot([apiFlag('bad-bool', { variations: [{ value: true }, { value: 'nope' }] })]);
    const result = await runCli(['generate', '--from-snapshot', snap], dir);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('bad-bool');
  });

  it('exits 2 naming the flag and value when codegen.number int does not fit', async () => {
    const [dir, snap] = await withSnapshot([multivariateFlag('big-number', [1, 3000000000], numberProp(['int']))]);
    const result = await runCli(['generate', '--from-snapshot', snap], dir);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('big-number');
    expect(result.stderr).toContain('3000000000');
  });

  it('exits 2 naming the flag and property when codegen.number has several values', async () => {
    const [dir, snap] = await withSnapshot([multivariateFlag('two-values', [1], numberProp(['int', 'int']))]);
    const result = await runCli(['generate', '--from-snapshot', snap], dir);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('two-values');
    expect(result.stderr).toContain('codegen.number');
  });
});
