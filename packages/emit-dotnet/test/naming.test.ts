import { describe, expect, it } from 'vitest';
import type { ApiFlag, Flag } from '@launchtarqly/core';
import { CodegenError, normalize } from '@launchtarqly/core';
import { dotnetEmitter } from '../src/index.js';
import { apiFlag, customProperty, modelFlag, snapshotOf } from '../../core/test/builders.js';

const cfg = { id: 'dotnet', out: 'Flags.g.cs', sdkMajor: 8, options: { namespace: 'MyApp.FeatureFlags' } } as const;

function emit(...flags: Flag[]): string {
  return dotnetEmitter.emit({ projectKey: 'my-project', flags }, cfg, { generatorVersion: '0.3.0' })[0]!.contents;
}

/** Emits flags read from the API, so `codegen.name*` custom properties resolve as in a real run. */
function emitApi(...items: ApiFlag[]): string {
  return dotnetEmitter.emit(normalize(snapshotOf(items)), cfg, { generatorVersion: '0.3.0' })[0]!.contents;
}

function withProps(props: Record<string, string>): Partial<ApiFlag> {
  return {
    customProperties: Object.assign({}, ...Object.entries(props).map(([name, value]) => customProperty(name, [value]))),
  };
}

/** The error `emit` throws: a CodegenError, which the CLI turns into exit 2. */
function emitError(...flags: Flag[]): CodegenError {
  try {
    emit(...flags);
  } catch (err) {
    expect(err).toBeInstanceOf(CodegenError);
    expect((err as CodegenError).exitCode).toBe(2);
    return err as CodegenError;
  }
  throw new Error('expected emit to fail');
}

describe('dotnet naming', () => {
  it('prefers the dotnet alias, then the all-target alias, then the converted key', () => {
    const out = emitApi(
      apiFlag('both-aliases', withProps({ 'codegen.name': 'Shared', 'codegen.name.dotnet': 'DotnetOnly' })),
      apiFlag('shared-alias', withProps({ 'codegen.name': 'SharedOnly', 'codegen.name.go': 'GoOnly' })),
      apiFlag('no-alias'),
    );
    expect(out).toContain('public bool DotnetOnly(Context context, bool fallback)');
    expect(out).not.toContain('Shared(');
    expect(out).toContain('public bool SharedOnly(Context context, bool fallback)');
    expect(out).toContain('public bool NoAlias(Context context, bool fallback)');
  });

  it('converts keys to UpperCamel', () => {
    expect(emit(modelFlag('beta.dark_mode'))).toContain('public bool BetaDarkMode(Context context, bool fallback)');
  });

  it('uses the dotnet alias for the method, its Detail variant and the key constant', () => {
    const out = emit(modelFlag('2fa-enabled', { aliases: { dotnet: 'TwoFactorEnabled', go: 'TwoFA' } }));
    expect(out).toContain('public bool TwoFactorEnabled(Context context, bool fallback)');
    expect(out).toContain('public EvaluationDetail<bool> TwoFactorEnabledDetail(Context context, bool fallback)');
    expect(out).toContain('public const string TwoFactorEnabled = "2fa-enabled";');
  });

  it('rejects a converted key with a leading digit, suggesting codegen.name.dotnet', () => {
    expect(() => emit(modelFlag('2fa-enabled'))).toThrow(
      new CodegenError(
        'flag 2fa-enabled: dotnet identifier "2faEnabled" starts with a digit; set the custom property codegen.name.dotnet to choose a name',
      ),
    );
  });

  it.each([
    ['equals', 'Equals'],
    ['get-hash-code', 'GetHashCode'],
    ['to-string', 'ToString'],
    ['get-type', 'GetType'],
    ['memberwise-clone', 'MemberwiseClone'],
    ['finalize', 'Finalize'],
    ['reference-equals', 'ReferenceEquals'],
  ])('rejects flag %s, whose name %s is a System.Object member', (key, name) => {
    expect(emitError(modelFlag(key)).message).toBe(
      `flag ${key}: dotnet identifier "${name}" is a reserved word; set the custom property codegen.name.dotnet to choose a name`,
    );
  });

  it.each([
    // Flags.Flags would be a member named like its class (CS0542).
    ['flags', {}, 'Flags'],
    // FlagKeys.FlagKeys likewise.
    ['flag-keys', {}, 'FlagKeys'],
    // The wrapper's private field.
    ['client', { aliases: { dotnet: '_client' } }, '_client'],
  ])('rejects flag %s, whose name collides with a name the generator uses', (key, extra, name) => {
    expect(emitError(modelFlag(key, extra)).message).toBe(
      `flag ${key}: dotnet identifier "${name}" collides with a name the generator uses; set the custom property codegen.name.dotnet to choose a name`,
    );
  });

  it.each(['class', 'string', 'object', 'namespace', 'stackalloc', 'true'])('rejects the alias %s, a C# keyword', (alias) => {
    expect(emitError(modelFlag('my-flag', { aliases: { dotnet: alias } })).message).toBe(
      `flag my-flag: dotnet identifier "${alias}" is a reserved word; set the custom property codegen.name.dotnet to choose a name`,
    );
  });

  it('accepts an alias that is a contextual keyword, since C# allows it as a member name', () => {
    expect(emit(modelFlag('my-flag', { aliases: { dotnet: 'var' } }))).toContain('public bool var(Context context, bool fallback)');
  });

  it.each(['my-flag', 'has space', 'dotted.name', '$cash', '@class'])('rejects the alias %s, which is not a C# identifier', (alias) => {
    expect(emitError(modelFlag('my-flag', { aliases: { dotnet: alias } })).message).toBe(
      `flag my-flag: dotnet identifier "${alias}" is not a valid identifier; set the custom property codegen.name.dotnet to choose a name`,
    );
  });

  it.each(['Größe', '日本', '_Legacy', 'Ünïcode_2'])('accepts the alias %s, which the C# identifier grammar allows', (alias) => {
    expect(emit(modelFlag('my-flag', { aliases: { dotnet: alias } }))).toContain(`public bool ${alias}(Context context, bool fallback)`);
  });

  it("rejects a flag whose name is another flag's Detail variant, naming both keys", () => {
    expect(emitError(modelFlag('checkout'), modelFlag('checkout-detail')).message).toBe(
      'dotnet identifier "CheckoutDetail" is produced by flags checkout and checkout-detail; set the custom property codegen.name.dotnet on one of them',
    );
  });

  it('rejects an alias that collides with another flag, method and FlagKeys constant alike', () => {
    expect(emitError(modelFlag('checkout'), modelFlag('checkout-v1', { aliases: { dotnet: 'Checkout' } })).message).toBe(
      'dotnet identifier "Checkout" is produced by flags checkout and checkout-v1; set the custom property codegen.name.dotnet on one of them',
    );
  });

  it('resolves a Detail collision once one flag has an alias', () => {
    const out = emit(modelFlag('checkout'), modelFlag('checkout-detail', { aliases: { dotnet: 'CheckoutDetailPage' } }));
    expect(out).toContain('public bool CheckoutDetailPage(Context context, bool fallback)');
    expect(out).toContain('public EvaluationDetail<bool> CheckoutDetail(Context context, bool fallback)');
  });
});
