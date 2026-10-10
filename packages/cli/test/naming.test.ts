import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { projectDir, runCli } from './helpers.js';

const config = {
  project: 'my-project',
  targets: [{ id: 'ts-server', out: 'src/flags.generated.ts', sdkMajor: 9 }],
};

function flag(key: string, customProperties: Record<string, { name: string; value: string[] }> = {}) {
  return {
    key,
    name: key,
    kind: 'boolean',
    variations: [{ value: true }, { value: false }],
    archived: false,
    deprecated: false,
    tags: [],
    customProperties,
  };
}

async function generate(...items: unknown[]) {
  const dir = await projectDir(config);
  const snapshot = join(dir, 'snapshot.json');
  await writeFile(
    snapshot,
    JSON.stringify({
      snapshotVersion: 1,
      projectKey: 'my-project',
      baseUri: 'https://app.launchdarkly.com',
      flagPages: [{ items }],
    }),
  );
  return runCli(['generate', '--from-snapshot', snapshot], dir);
}

describe('generate fails on names the user must choose', () => {
  it('exits 2 on a key with a leading digit, suggesting the ts-server alias', async () => {
    const result = await generate(flag('2fa-enabled'));
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('2fa-enabled');
    expect(result.stderr).toContain('codegen.name.ts-server');
  });

  it('exits 2 when a Detail method collides with another flag, naming both keys', async () => {
    const result = await generate(flag('checkout'), flag('checkout-detail'));
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('flags checkout and checkout-detail');
    expect(result.stderr).toContain('codegen.name.ts-server');
  });

  it('exits 2 on a multi-valued codegen.name.ts-server, naming the flag and property', async () => {
    const result = await generate(flag('my-flag', { 'codegen.name.ts-server': { name: 'n', value: ['a', 'b'] } }));
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('flag my-flag: custom property codegen.name.ts-server');
  });

  it('succeeds once an alias resolves the problem', async () => {
    const result = await generate(flag('2fa-enabled', { 'codegen.name': { name: 'n', value: ['twoFactor'] } }));
    expect(result).toMatchObject({ exitCode: 0, stderr: '' });
  });
});
