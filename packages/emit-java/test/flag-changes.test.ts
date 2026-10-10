import { readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalize, parseSnapshot, type GeneratedFlag } from '@launchtarqly/core';
import { parseJavaFlags } from '../src/index.js';
import { flagNames } from '../src/naming.js';
import { generatedKind, javaKind } from '../src/kinds.js';

const FIXTURES = resolve(import.meta.dirname, '../../../fixtures');
const GOLDEN = join(FIXTURES, 'golden/java');

/** The flags a golden file was generated from: its snapshot's model, as the java target names them. */
function snapshotFlags(name: string): GeneratedFlag[] {
  const snapshot = parseSnapshot(readFileSync(join(FIXTURES, 'snapshots', `${name}.json`), 'utf8'));
  const model = normalize(snapshot);
  const names = flagNames(model);
  return model.flags.map((flag) => ({
    key: flag.key,
    identifier: names.get(flag)!.method,
    ...generatedKind(javaKind(flag)),
  }));
}

describe('parseJavaFlags', () => {
  it.each(readdirSync(GOLDEN).filter((f) => f.endsWith('.java')))('reads back the %s golden file', (file) => {
    const text = readFileSync(join(GOLDEN, file), 'utf8');
    const expected = snapshotFlags(basename(file, '.java'));
    expect(expected.length).toBeGreaterThan(0);
    expect(parseJavaFlags(text)).toEqual(expected);
  });
});

const FLAG_KINDS = readFileSync(join(GOLDEN, 'flag-kinds.java'), 'utf8');

describe('parseJavaFlags on hand-edited files', () => {
  it('reads a key with escaped characters', () => {
    const text = FLAG_KINDS.replace('SAMPLE_RATE = "sample-rate";', 'SAMPLE_RATE = "say \\"hi\\" \\\\o/";');
    expect(parseJavaFlags(text)?.at(-1)).toEqual({ key: 'say "hi" \\o/', identifier: 'sampleRate', kind: 'number', numberType: 'double' });
  });

  it('returns undefined for a file without Keys', () => {
    expect(parseJavaFlags('package x;\n\npublic final class Flags {}\n')).toBeUndefined();
  });

  it('returns undefined when a Keys member is not a string constant', () => {
    const text = FLAG_KINDS.replace('SAMPLE_RATE = "sample-rate";', 'SAMPLE_RATE = computeKey();');
    expect(parseJavaFlags(text)).toBeUndefined();
  });

  it('returns undefined when no primary method reads a constant', () => {
    const text = FLAG_KINDS.replace(
      'SAMPLE_RATE = "sample-rate";',
      'SAMPLE_RATE = "sample-rate";\n\n    public static final String GHOST = "ghost";',
    );
    expect(parseJavaFlags(text)).toBeUndefined();
  });

  it('returns undefined when a method calls the wrong SDK method for its return type', () => {
    const text = FLAG_KINDS.replace('return client.intVariation(', 'return client.doubleVariation(');
    expect(parseJavaFlags(text)).toBeUndefined();
  });
});

describe('parseJavaFlags on edited output', () => {
  it('reads renamed, re-typed and replaced flags, telling int from double', () => {
    const next = FLAG_KINDS
      // max-cart-items moves from int to double (codegen.number removed).
      .replace(
        'public int maxCartItems(LDContext context, int fallback) {\n    return client.intVariation(',
        'public double maxCartItems(LDContext context, double fallback) {\n    return client.doubleVariation(',
      )
      // pricing-tier gets an alias.
      .replaceAll('pricingTier', 'tier')
      .replaceAll('PRICING_TIER', 'TIER')
      // banner-ids is replaced by hero-ids.
      .replaceAll('BANNER_IDS', 'HERO_IDS')
      .replace('"banner-ids"', '"hero-ids"');
    expect(parseJavaFlags(next)).toEqual([
      { key: 'hero-ids', identifier: 'bannerIds', kind: 'json' },
      { key: 'checkout-config', identifier: 'checkoutConfig', kind: 'json' },
      { key: 'checkout-v2', identifier: 'checkoutV2', kind: 'boolean' },
      { key: 'max-cart-items', identifier: 'maxCartItems', kind: 'number', numberType: 'double' },
      { key: 'pricing-tier', identifier: 'tier', kind: 'string' },
      { key: 'sample-rate', identifier: 'sampleRate', kind: 'number', numberType: 'double' },
    ]);
  });

  it('reads the method name, not the Keys constant, so an alias rename that keeps the constant shows', () => {
    // apiUrlId and apiURLId both give the constant API_URL_ID.
    const before = FLAG_KINDS.replaceAll('sampleRate', 'apiUrlId').replaceAll('SAMPLE_RATE', 'API_URL_ID');
    const after = FLAG_KINDS.replaceAll('sampleRate', 'apiURLId').replaceAll('SAMPLE_RATE', 'API_URL_ID');
    const sampleRate = (text: string) => parseJavaFlags(text)?.find((f) => f.key === 'sample-rate')?.identifier;
    expect(sampleRate(before)).toBe('apiUrlId');
    expect(sampleRate(after)).toBe('apiURLId');
  });

  it('reads the same flags whatever generator version wrote the file', () => {
    expect(parseJavaFlags(FLAG_KINDS.replace('0.1.0', '0.0.9'))).toEqual(parseJavaFlags(FLAG_KINDS));
  });
});
