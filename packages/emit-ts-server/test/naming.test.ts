import { describe, expect, it } from 'vitest';
import { CodegenError, type Flag, type FlagModel } from '@launchtarqly/core';
import { tsServerEmitter } from '../src/index.js';

function boolFlag(key: string, aliases: Flag['aliases'] = {}): Flag {
  return {
    key,
    name: key,
    description: '',
    kind: 'boolean',
    clientSideAvailability: { usingEnvironmentId: false, usingMobileKey: true },
    tags: [],
    deprecated: false,
    archived: false,
    aliases,
    uiUrl: `https://app.launchdarkly.com/projects/my-project/flags/${key}`,
  };
}

const cfg = { id: 'ts-server', out: 'src/flags.generated.ts', sdkMajor: 9 } as const;
const ctx = { generatorVersion: '0.3.0' };

function emit(...flags: Flag[]): string {
  const model: FlagModel = { projectKey: 'my-project', flags };
  return tsServerEmitter.emit(model, cfg, ctx)[0]!.contents;
}

describe('ts-server naming', () => {
  it('uses the ts-server alias for the methods and the FlagKeys entry', () => {
    const out = emit(boolFlag('2fa-enabled', { 'ts-server': 'twoFactorEnabled', go: 'TwoFA' }));
    expect(out).toContain('  twoFactorEnabled(context: LDContext, fallback: boolean): Promise<boolean> {');
    expect(out).toContain('  twoFactorEnabledDetail(context: LDContext');
    expect(out).toContain("return this.client.boolVariation('2fa-enabled', context, fallback);");
    expect(out).toContain("  twoFactorEnabled: '2fa-enabled',");
    expect(out).not.toContain('2faEnabled');
  });

  it('fails on a converted key with a leading digit', () => {
    expect(() => emit(boolFlag('2fa-enabled'))).toThrow(
      new CodegenError(
        'flag 2fa-enabled: ts-server identifier "2faEnabled" starts with a digit; set the custom property codegen.name.ts-server to choose a name',
      ),
    );
  });

  it('fails on a reserved word', () => {
    expect(() => emit(boolFlag('delete'))).toThrow(/flag delete: .*reserved word.*codegen\.name\.ts-server/);
  });

  it('validates an alias like a converted key', () => {
    expect(() => emit(boolFlag('ok-flag', { 'ts-server': 'class' }))).toThrow(/flag ok-flag: .*"class" is a reserved word/);
    expect(() => emit(boolFlag('ok-flag', { 'ts-server': 'not valid' }))).toThrow(/"not valid" is not a valid identifier/);
  });

  it("fails when a flag's Detail method collides with another flag", () => {
    expect(() => emit(boolFlag('checkout'), boolFlag('checkout-detail'))).toThrow(
      new CodegenError(
        'ts-server identifier "checkoutDetail" is produced by flags checkout and checkout-detail; set the custom property codegen.name.ts-server on one of them',
      ),
    );
  });

  it('fails when two keys convert to the same name', () => {
    expect(() => emit(boolFlag('dark-mode'), boolFlag('dark_mode'))).toThrow(/flags dark-mode and dark_mode/);
  });

  it('fails when a flag name collides with a Flags class member', () => {
    expect(() => emit(boolFlag('client'))).toThrow(/flag client: .*collides with a name the generator uses/);
  });
});
