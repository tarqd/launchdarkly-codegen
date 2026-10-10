import { describe, expect, it } from 'vitest';
import { CodegenError, type TargetConfig } from '@launchtarqly/core';
import { dotnetEmitter } from '../src/index.js';
import { modelFlag } from '../../core/test/builders.js';

function emitWith(options: Partial<TargetConfig>) {
  const cfg: TargetConfig = { id: 'dotnet', out: 'Flags.g.cs', sdkMajor: 8, namespace: 'MyApp.FeatureFlags', ...options };
  return dotnetEmitter.emit({ projectKey: 'my-project', flags: [modelFlag('checkout')] }, cfg, { generatorVersion: '0.3.0' });
}

describe('dotnet target options', () => {
  it('writes the namespace given', () => {
    expect(emitWith({ namespace: 'Billing' })[0]?.contents).toContain('\nnamespace Billing\n{\n');
  });

  it.each([
    ['missing', undefined],
    ['not a string', 42],
    ['empty', ''],
    ['a segment that is not an identifier', 'MyApp.2Flags'],
    ['an empty segment', 'MyApp..Flags'],
    ['a trailing dot', 'MyApp.'],
    ['not dotted identifiers', 'My-App'],
  ])('rejects a namespace that is %s', (_name, namespace) => {
    expect(() => emitWith({ namespace })).toThrow(CodegenError);
    expect(() => emitWith({ namespace })).toThrow(/dotnet target: `namespace`/);
  });

  it('accepts .cs output paths, with or without .g', () => {
    expect(emitWith({ out: 'src/Flags.cs' })[0]?.path).toBe('src/Flags.cs');
    expect(emitWith({ out: 'src/Flags.g.cs' })[0]?.path).toBe('src/Flags.g.cs');
  });

  it('rejects an out that does not end in .cs', () => {
    expect(() => emitWith({ out: 'src/Flags.ts' })).toThrow(
      new CodegenError('dotnet target: `out` must be the path of a .cs file (for example Flags.g.cs), got "src/Flags.ts"'),
    );
  });
});
