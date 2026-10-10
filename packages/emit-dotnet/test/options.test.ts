import { describe, expect, it } from 'vitest';
import { parseTargetOptions } from '@launchtarqly/core';
import { dotnetEmitter } from '../src/index.js';
import { modelFlag } from '../../core/test/builders.js';

/** The dotnet options parsed from a target's keys; a failure throws `<key> <message>`. */
function parse(raw: Record<string, unknown>) {
  return parseTargetOptions(dotnetEmitter.options!, raw, (key, message) => {
    throw new Error(`${key} ${message}`);
  });
}

describe('dotnet target options', () => {
  it('declares .cs as the only out extension', () => {
    expect(dotnetEmitter.outExtensions).toEqual(['.cs']);
  });

  it('writes the namespace given', () => {
    const cfg = { id: 'dotnet', out: 'Flags.g.cs', sdkMajor: 8, options: parse({ namespace: 'Billing' }) } as const;
    const [file] = dotnetEmitter.emit({ projectKey: 'my-project', flags: [modelFlag('checkout')] }, cfg, { generatorVersion: '0.3.0' });
    expect(file?.contents).toContain('\nnamespace Billing\n{\n');
  });

  it('requires a namespace', () => {
    expect(() => parse({})).toThrow('namespace is required (for example MyApp.FeatureFlags)');
  });

  it.each([
    ['not a string', 42, 'must be a string, got 42'],
    ['empty', '', 'must be dotted C# identifiers'],
    ['a segment that is not an identifier', 'MyApp.2Flags', 'must be dotted C# identifiers'],
    ['an empty segment', 'MyApp..Flags', 'must be dotted C# identifiers'],
    ['a trailing dot', 'MyApp.', 'must be dotted C# identifiers'],
    ['not dotted identifiers', 'My-App', 'must be dotted C# identifiers (for example MyApp.FeatureFlags), got "My-App"'],
  ])('rejects a namespace that is %s', (_name, namespace, message) => {
    expect(() => parse({ namespace })).toThrow(`namespace ${message}`);
  });

  it.each([
    ['MyApp.namespace.Flags2', 'namespace'],
    ['class', 'class'],
    ['MyApp.string', 'string'],
  ])('rejects the namespace %s, whose segment %s is a C# keyword', (namespace, segment) => {
    expect(() => parse({ namespace })).toThrow(`namespace segment "${segment}" is a C# keyword; got ${JSON.stringify(namespace)}`);
  });

  it.each(['MyApp.Flags', 'MyApp.FlagKeys', 'Flags'])(
    'rejects the namespace %s, whose last segment would hide the generated class (CS0118)',
    (namespace) => {
      const last = namespace.split('.').pop();
      expect(() => parse({ namespace })).toThrow(
        `namespace must not end in ${last}, the name of a generated class (code in the parent namespace would resolve ${last} to the namespace); got ${JSON.stringify(namespace)}`,
      );
    },
  );

  it('accepts Flags or FlagKeys as a segment other than the last, and Unicode identifiers', () => {
    expect(parse({ namespace: 'Flags.Größe' })).toEqual({ namespace: 'Flags.Größe' });
  });
});
