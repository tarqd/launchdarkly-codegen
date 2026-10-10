import { readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalize, parseSnapshot } from '@launchtarqly/core';
import { goEmitter, parseGoFlags } from '../src/index.js';
import { modelFlag } from '../../core/test/builders.js';

const FIXTURES = resolve(import.meta.dirname, '../../../fixtures');
const GOLDEN = join(FIXTURES, 'golden/go');

const cfg = { id: 'go', out: 'flags_gen.go', sdkMajor: 7, package: 'ldflags' } as const;
const ctx = { generatorVersion: '0.3.0' };

/** Go output for one flag of every kind (both number types), one of them deprecated. */
const OLD = goEmitter.emit(
  {
    projectKey: 'my-project',
    flags: [
      modelFlag('checkout-config', { kind: 'json', deprecated: true, deprecationMessage: 'Use checkout-layout instead.' }),
      modelFlag('checkout-v2', { kind: 'boolean' }),
      modelFlag('max-items', { kind: 'number', numberType: 'int' }),
      modelFlag('old-thing', { kind: 'boolean' }),
      modelFlag('pricing-tier', { kind: 'string' }),
      modelFlag('sample-rate', { kind: 'number', numberType: 'double' }),
    ],
  },
  cfg,
  ctx,
)[0]!.contents;

describe('parseGoFlags', () => {
  it('reads key, identifier, kind and number type for every Key constant', () => {
    expect(parseGoFlags(OLD)).toEqual([
      { key: 'checkout-config', identifier: 'CheckoutConfig', kind: 'json' },
      { key: 'checkout-v2', identifier: 'CheckoutV2', kind: 'boolean' },
      { key: 'max-items', identifier: 'MaxItems', kind: 'number', numberType: 'int' },
      { key: 'old-thing', identifier: 'OldThing', kind: 'boolean' },
      { key: 'pricing-tier', identifier: 'PricingTier', kind: 'string' },
      { key: 'sample-rate', identifier: 'SampleRate', kind: 'number', numberType: 'double' },
    ]);
  });

  it.each(readdirSync(GOLDEN).filter((f) => f.endsWith('.go')))('returns the flags generated from the %s snapshot', (name) => {
    const text = readFileSync(join(GOLDEN, name), 'utf8');
    const snapshot = parseSnapshot(readFileSync(join(FIXTURES, 'snapshots', `${basename(name, '.go')}.json`), 'utf8'));
    const identifiers = new Map(
      [...text.matchAll(/^\tKey(\w+) += "([^"]*)"$/gm)].map(([, identifier, key]) => [key!, identifier!]),
    );
    const expected = normalize(snapshot).flags.map((f) => ({
      key: f.key,
      identifier: identifiers.get(f.key),
      kind: f.kind,
      ...(f.numberType !== undefined && { numberType: f.numberType }),
    }));
    expect(parseGoFlags(text)).toEqual(expected);
  });

  it('unescapes quoted keys', () => {
    const text = OLD.replace('= "old-thing"', '= "old\\"thing"');
    expect(parseGoFlags(text)?.find((f) => f.identifier === 'OldThing')?.key).toBe('old"thing');
  });

  it('returns an empty list for a file with no flags', () => {
    const empty = goEmitter.emit({ projectKey: 'my-project', flags: [] }, cfg, ctx)[0]!.contents;
    expect(parseGoFlags(empty)).toEqual([]);
  });

  it('returns undefined for a file that is not go output', () => {
    expect(parseGoFlags('package main\n')).toBeUndefined();
    expect(parseGoFlags('hand-edited nonsense\n')).toBeUndefined();
  });

  it('returns undefined when a Key constant is not recognizable', () => {
    expect(parseGoFlags(OLD.replace('= "max-items"', '= computeKey()'))).toBeUndefined();
  });

  it('returns undefined when a Key constant has no method', () => {
    expect(parseGoFlags(OLD.replace('\tKeyOldThing ', '\tKeyGhost = "ghost"\n\tKeyOldThing '))).toBeUndefined();
  });

  it('returns undefined when a method has an unknown type', () => {
    expect(parseGoFlags(OLD.replaceAll('fallback string) (string, error)', 'fallback rune) (rune, error)'))).toBeUndefined();
  });
});

describe('parseGoFlags on edited output', () => {
  it('reads renamed, re-typed and replaced flags', () => {
    const next = OLD.replaceAll('fallback ldvalue.Value) (ldvalue.Value, error)', 'fallback string) (string, error)')
      .replaceAll('MaxItems', 'ItemLimit')
      .replaceAll('OldThing', 'NewThing')
      .replace('= "old-thing"', '= "new-thing"');
    expect(parseGoFlags(next)).toEqual([
      { key: 'checkout-config', identifier: 'CheckoutConfig', kind: 'string' },
      { key: 'checkout-v2', identifier: 'CheckoutV2', kind: 'boolean' },
      { key: 'max-items', identifier: 'ItemLimit', kind: 'number', numberType: 'int' },
      { key: 'new-thing', identifier: 'NewThing', kind: 'boolean' },
      { key: 'pricing-tier', identifier: 'PricingTier', kind: 'string' },
      { key: 'sample-rate', identifier: 'SampleRate', kind: 'number', numberType: 'double' },
    ]);
  });

  it('reads a number flag switched from int to float64 as a double', () => {
    const next = OLD.replaceAll('fallback int) (int, error)', 'fallback float64) (float64, error)');
    expect(parseGoFlags(next)?.find((f) => f.key === 'max-items')).toEqual({
      key: 'max-items',
      identifier: 'MaxItems',
      kind: 'number',
      numberType: 'double',
    });
  });

  it('reads the same flags whatever generator version wrote the file', () => {
    expect(parseGoFlags(OLD.replace('0.3.0', '0.2.9'))).toEqual(parseGoFlags(OLD));
  });
});
