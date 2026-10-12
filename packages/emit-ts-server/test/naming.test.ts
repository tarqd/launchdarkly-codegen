import { describe, expect, it } from 'vitest';
import { CodegenError, type Flag, type FlagModel } from '@launchtarqly/core';
import { tsServerEmitter } from '../src/index.js';
import { modelFlag } from '../../core/test/builders.js';

const cfg = { id: 'ts-server', out: 'src/flags.generated.ts', sdkMajor: 9, options: {} } as const;
const ctx = { generatorVersion: '0.3.0' };

function emit(...flags: Flag[]): string {
  const model: FlagModel = { projectKey: 'my-project', flags };
  return tsServerEmitter.emit(model, cfg, ctx)[0]!.contents;
}

describe('ts-server naming', () => {
  it('uses the ts-server alias for the methods and the FlagKeys entry', () => {
    const out = emit(modelFlag('2fa-enabled', { aliases: { 'ts-server': 'twoFactorEnabled', go: 'TwoFA' } }));
    expect(out).toContain('  twoFactorEnabled(context: LDContext, fallback: boolean): Promise<boolean> {');
    expect(out).toContain('  twoFactorEnabledDetail(context: LDContext');
    expect(out).toContain("return this.client.boolVariation('2fa-enabled', context, fallback);");
    expect(out).toContain("  twoFactorEnabled: '2fa-enabled',");
    expect(out).not.toContain('2faEnabled');
  });

  it('fails on a converted key with a leading digit', () => {
    expect(() => emit(modelFlag('2fa-enabled'))).toThrow(
      new CodegenError(
        'flag 2fa-enabled: ts-server identifier "2faEnabled" starts with a digit; add the value ts-server:<name> to the custom property codegen.name to choose a name',
      ),
    );
  });

  it('fails on a reserved word', () => {
    expect(() => emit(modelFlag('delete'))).toThrow(/flag delete: .*reserved word.*ts-server:<name>/);
  });

  it('validates an alias like a converted key', () => {
    expect(() => emit(modelFlag('ok-flag', { aliases: { 'ts-server': 'class' } }))).toThrow(/flag ok-flag: .*"class" is a reserved word/);
    expect(() => emit(modelFlag('ok-flag', { aliases: { 'ts-server': 'not valid' } }))).toThrow(/"not valid" is not a valid identifier/);
  });

  it("fails when a flag's Detail method collides with another flag", () => {
    expect(() => emit(modelFlag('checkout'), modelFlag('checkout-detail'))).toThrow(
      new CodegenError(
        'ts-server identifier "checkoutDetail" is produced by flags checkout and checkout-detail; add the value ts-server:<name> to the custom property codegen.name on one of them',
      ),
    );
  });

  it('checks Detail collisions for string, number and json flags too', () => {
    const stringFlag: Flag = { ...modelFlag('checkout'), kind: 'string' };
    const jsonFlag: Flag = { ...modelFlag('checkout-detail'), kind: 'json' };
    expect(() => emit(stringFlag, jsonFlag)).toThrow(/"checkoutDetail" is produced by flags checkout and checkout-detail/);
    const numberFlag: Flag = { ...modelFlag('limit'), kind: 'number', numberType: 'double' };
    expect(() => emit(numberFlag, modelFlag('limit-detail'))).toThrow(/flags limit and limit-detail/);
  });

  it('fails when two keys convert to the same name', () => {
    expect(() => emit(modelFlag('dark-mode'), modelFlag('dark_mode'))).toThrow(/flags dark-mode and dark_mode/);
  });

  it('fails when a flag name collides with a Flags class member', () => {
    expect(() => emit(modelFlag('client'))).toThrow(/flag client: .*collides with a name the generator uses/);
  });
});
