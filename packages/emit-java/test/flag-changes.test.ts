import { readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalize, parseSnapshot, type GeneratedFlag } from '@launchtarqly/core';
import { parseJavaFlags, summarizeJavaChanges } from '../src/index.js';
import { flagNames } from '../src/naming.js';

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
    kind: flag.kind === 'number' ? (flag.numberType ?? 'double') : flag.kind,
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
    expect(parseJavaFlags(text)?.at(-1)).toEqual({ key: 'say "hi" \\o/', identifier: 'sampleRate', kind: 'double' });
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

describe('summarizeJavaChanges', () => {
  it('reports added, removed, renamed and changed-kind flags, telling int from double', () => {
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
    expect(summarizeJavaChanges(FLAG_KINDS, next)).toBe(
      'flags: 1 added (hero-ids), 1 removed (banner-ids), 1 renamed (pricing-tier: pricingTier → tier), 1 changed kind (max-cart-items: int → double)',
    );
  });

  it('reports an alias rename that keeps the Keys constant', () => {
    // apiUrlId and apiURLId both give the constant API_URL_ID.
    const before = FLAG_KINDS.replaceAll('sampleRate', 'apiUrlId').replaceAll('SAMPLE_RATE', 'API_URL_ID');
    const after = FLAG_KINDS.replaceAll('sampleRate', 'apiURLId').replaceAll('SAMPLE_RATE', 'API_URL_ID');
    expect(summarizeJavaChanges(before, after)).toBe('flags: 1 renamed (sample-rate: apiUrlId → apiURLId)');
  });

  it('says so when no flag changed (for example a generator upgrade)', () => {
    expect(summarizeJavaChanges(FLAG_KINDS.replace('0.1.0', '0.0.9'), FLAG_KINDS)).toBe('flags: no changes');
  });

  it('returns undefined when either side cannot be parsed', () => {
    expect(summarizeJavaChanges('garbage', FLAG_KINDS)).toBeUndefined();
    expect(summarizeJavaChanges(FLAG_KINDS, 'garbage')).toBeUndefined();
  });
});
