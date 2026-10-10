import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDotnetFlags, summarizeDotnetChanges } from '../src/index.js';

const GOLDEN = resolve(import.meta.dirname, '../../../fixtures/golden/dotnet');
const golden = (name: string) => readFileSync(join(GOLDEN, name), 'utf8');
/** One flag of every kind, in both number types. */
const KINDS = golden('flag-kinds.g.cs');
/** Has a deprecated flag, whose members carry `#if` / `[System.Obsolete]` lines. */
const DEPRECATED = golden('doc-comments.g.cs');

describe('parseDotnetFlags', () => {
  it.each(readdirSync(GOLDEN).filter((f) => f.endsWith('.cs')))('parses the %s golden file', (name) => {
    const text = readFileSync(join(GOLDEN, name), 'utf8');
    const constants = text.match(/^ {8}public const string \w+ = "[^"]*";$/gm)!;
    expect(constants.length).toBeGreaterThan(0);
    expect(parseDotnetFlags(text)?.map((f) => `        public const string ${f.identifier} = "${f.key}";`)).toEqual(constants);
  });

  it('reads every kind, int and double both as number', () => {
    expect(parseDotnetFlags(KINDS)).toEqual([
      { key: 'banner-ids', identifier: 'BannerIds', kind: 'json' },
      { key: 'checkout-config', identifier: 'CheckoutConfig', kind: 'json' },
      { key: 'checkout-v2', identifier: 'CheckoutV2', kind: 'boolean' },
      { key: 'max-cart-items', identifier: 'MaxCartItems', kind: 'number' },
      { key: 'pricing-tier', identifier: 'PricingTier', kind: 'string' },
      { key: 'sample-rate', identifier: 'SampleRate', kind: 'number' },
    ]);
  });

  it('reads past the [System.Obsolete] lines of a deprecated flag', () => {
    expect(parseDotnetFlags(DEPRECATED)).toContainEqual({ key: 'legacy-cart', identifier: 'LegacyCart', kind: 'boolean' });
  });

  it('reads a Unicode identifier', () => {
    const text = KINDS.replaceAll('PricingTier', 'Préço');
    expect(parseDotnetFlags(text)).toContainEqual({ key: 'pricing-tier', identifier: 'Préço', kind: 'string' });
  });

  it('unescapes quoted keys', () => {
    const text = KINDS.replace('"pricing-tier"', String.raw`"a\"b"`);
    expect(parseDotnetFlags(text)).toContainEqual({ key: 'a"b', identifier: 'PricingTier', kind: 'string' });
  });

  it('returns undefined for a file without FlagKeys', () => {
    expect(parseDotnetFlags('namespace X { public class Y { } }\n')).toBeUndefined();
    expect(parseDotnetFlags('hand-edited nonsense\n')).toBeUndefined();
  });

  it('returns undefined when a FlagKeys entry is not recognizable', () => {
    expect(parseDotnetFlags(KINDS.replace('SampleRate = "sample-rate";', 'SampleRate = Compute();'))).toBeUndefined();
  });

  it('returns undefined when a FlagKeys entry has no method', () => {
    const text = KINDS.replace('= "sample-rate";', '= "sample-rate";\n        public const string Ghost = "ghost";');
    expect(parseDotnetFlags(text)).toBeUndefined();
  });
});

describe('summarizeDotnetChanges', () => {
  it('reports added, removed, renamed and changed-kind flags', () => {
    const next = KINDS.replaceAll('LdValue CheckoutConfig', 'string CheckoutConfig')
      .replace('JsonVariation(FlagKeys.CheckoutConfig', 'StringVariation(FlagKeys.CheckoutConfig')
      .replaceAll('MaxCartItems', 'CartLimit')
      .replace('"banner-ids"', '"promo-ids"');
    expect(summarizeDotnetChanges(KINDS, next)).toBe(
      'flags: 1 added (promo-ids), 1 removed (banner-ids), 1 renamed (max-cart-items: MaxCartItems → CartLimit), 1 changed kind (checkout-config: json → string)',
    );
  });

  it('says so when no flag changed (for example a generator upgrade)', () => {
    expect(summarizeDotnetChanges(KINDS.replace('generator: 0.1.0', 'generator: 0.0.9'), KINDS)).toBe('flags: no changes');
  });

  it('returns undefined when either side cannot be parsed', () => {
    expect(summarizeDotnetChanges('garbage', KINDS)).toBeUndefined();
    expect(summarizeDotnetChanges(KINDS, 'garbage')).toBeUndefined();
  });
});
