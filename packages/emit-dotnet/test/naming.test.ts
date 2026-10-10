import { describe, expect, it } from 'vitest';
import type { Flag } from '@launchtarqly/core';
import { CodegenError } from '@launchtarqly/core';
import { dotnetEmitter } from '../src/index.js';
import { modelFlag } from '../../core/test/builders.js';

const cfg = { id: 'dotnet', out: 'Flags.g.cs', sdkMajor: 8, namespace: 'MyApp.FeatureFlags' } as const;

function emit(...flags: Flag[]): string {
  return dotnetEmitter.emit({ projectKey: 'my-project', flags }, cfg, { generatorVersion: '0.3.0' })[0]!.contents;
}

describe('dotnet naming', () => {
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
});
