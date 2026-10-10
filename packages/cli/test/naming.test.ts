import { describe, expect, it } from 'vitest';
import type { ApiFlag } from '@launchtarqly/core';
import { apiFlag, customProperty } from '../../core/test/builders.js';
import { projectDir, runCli, writeSnapshot } from './helpers.js';

const config = {
  project: 'my-project',
  targets: [{ id: 'ts-server', out: 'src/flags.generated.ts', sdkMajor: 9 }],
};

async function generate(...items: ApiFlag[]) {
  const dir = await projectDir(config);
  return runCli(['generate', '--from-snapshot', await writeSnapshot(dir, items)], dir);
}

describe('generate fails on names the user must choose', () => {
  it('exits 2 on a key with a leading digit, suggesting the ts-server alias', async () => {
    const result = await generate(apiFlag('2fa-enabled'));
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('2fa-enabled');
    expect(result.stderr).toContain('codegen.name.ts-server');
  });

  it('exits 2 when a Detail method collides with another flag, naming both keys', async () => {
    const result = await generate(apiFlag('checkout'), apiFlag('checkout-detail'));
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('flags checkout and checkout-detail');
    expect(result.stderr).toContain('codegen.name.ts-server');
  });

  it('exits 2 on a multi-valued codegen.name.ts-server, naming the flag and property', async () => {
    const result = await generate(apiFlag('my-flag', { customProperties: customProperty('codegen.name.ts-server', ['a', 'b']) }));
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('flag my-flag: custom property codegen.name.ts-server');
  });

  it('succeeds once an alias resolves the problem', async () => {
    const result = await generate(apiFlag('2fa-enabled', { customProperties: customProperty('codegen.name', ['twoFactor']) }));
    expect(result).toMatchObject({ exitCode: 0, stderr: '' });
  });
});

describe('generate fails on dotnet names the user must choose', () => {
  const dotnetConfig = {
    project: 'my-project',
    targets: [{ id: 'dotnet', out: 'Flags.g.cs', sdkMajor: 8, namespace: 'MyApp.FeatureFlags' }],
  };

  async function generateDotnet(...items: ApiFlag[]) {
    const dir = await projectDir(dotnetConfig);
    return runCli(['generate', '--from-snapshot', await writeSnapshot(dir, items)], dir);
  }

  it.each([
    ['a key with a leading digit', apiFlag('2fa-enabled'), '2fa-enabled'],
    ['a name that hides a System.Object member', apiFlag('to-string'), 'ToString'],
    ['a C# keyword alias', apiFlag('my-flag', { customProperties: customProperty('codegen.name.dotnet', ['class']) }), 'class'],
  ])('exits 2 on %s, suggesting the dotnet alias', async (_name, item, named) => {
    const result = await generateDotnet(item);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain(named);
    expect(result.stderr).toContain('codegen.name.dotnet');
  });

  it('succeeds once a dotnet alias resolves the problem', async () => {
    const result = await generateDotnet(
      apiFlag('2fa-enabled', { customProperties: customProperty('codegen.name.dotnet', ['TwoFactor']) }),
    );
    expect(result).toMatchObject({ exitCode: 0, stderr: '' });
  });
});
