import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
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

describe('go names', () => {
  const goConfig = {
    project: 'my-project',
    targets: [{ id: 'go', out: 'flags_gen.go', sdkMajor: 7, package: 'ldflags' }],
  };

  async function generateGo(...items: ApiFlag[]) {
    const dir = await projectDir(goConfig);
    const result = await runCli(['generate', '--from-snapshot', await writeSnapshot(dir, items)], dir);
    const text = result.exitCode === 0 ? await readFile(join(dir, 'flags_gen.go'), 'utf8') : '';
    return { ...result, text };
  }

  it('prefers codegen.name.go over codegen.name over the converted key', async () => {
    const both = {
      ...customProperty('codegen.name', ['AllTargets']),
      ...customProperty('codegen.name.go', ['GoOnly']),
    };
    const result = await generateGo(
      apiFlag('api-url', { customProperties: both }),
      apiFlag('fallback-flag', { customProperties: customProperty('codegen.name', ['Fallback']) }),
      apiFlag('user-id'),
    );
    expect(result).toMatchObject({ exitCode: 0, stderr: '' });
    expect(result.text).toContain('func (f *Flags) GoOnly(');
    expect(result.text).toContain('func (f *Flags) Fallback(');
    expect(result.text).toContain('func (f *Flags) UserID(');
    expect(result.text).not.toContain('AllTargets');
    expect(result.text).not.toContain('APIURL');
    expect(result.text).not.toContain('FallbackFlag');
  });

  it.each([
    ['a leading digit', [apiFlag('2fa-enabled')], 'flag 2fa-enabled: go identifier "2faEnabled" starts with a digit'],
    [
      'a lowercase alias',
      [apiFlag('checkout', { customProperties: customProperty('codegen.name.go', ['checkout']) })],
      'flag checkout: go identifier "checkout" is not an exported Go identifier',
    ],
    [
      'an alias that starts with a non-letter',
      [apiFlag('checkout', { customProperties: customProperty('codegen.name', ['_Checkout']) })],
      'flag checkout: go identifier "_Checkout" is not an exported Go identifier',
    ],
    [
      'a variant colliding with another flag',
      [apiFlag('checkout'), apiFlag('checkout-detail')],
      'go identifier "CheckoutDetail" is produced by flags checkout and checkout-detail',
    ],
    [
      'a Key constant colliding with another flag',
      [apiFlag('checkout'), apiFlag('key-checkout')],
      'go identifier "KeyCheckout" is produced by flags checkout and key-checkout',
    ],
    ['the name Client', [apiFlag('client')], 'flag client: go identifier "Client" collides with a name the generator uses'],
    ['the name Flags', [apiFlag('flags')], 'flag flags: go identifier "Flags" collides with a name the generator uses'],
    ['the name New', [apiFlag('new')], 'flag new: go identifier "New" collides with a name the generator uses'],
  ])('exits 2 on %s, naming the flags and suggesting codegen.name.go', async (_name, items, message) => {
    const result = await generateGo(...items);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain(message);
    expect(result.stderr).toContain('set the custom property codegen.name.go');
  });
});
