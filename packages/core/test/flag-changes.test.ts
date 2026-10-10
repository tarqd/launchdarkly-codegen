import { describe, expect, it } from 'vitest';
import { summarizeFlagChanges, summarizeReadBack, type GeneratedFlag } from '../src/index.js';

const flags: GeneratedFlag[] = [
  { key: 'checkout-v2', identifier: 'checkoutV2', kind: 'boolean' },
  { key: 'max-items', identifier: 'maxItems', kind: 'number' },
  { key: 'checkout-config', identifier: 'checkoutConfig', kind: 'json' },
  { key: 'old-thing', identifier: 'oldThing', kind: 'boolean' },
];

describe('summarizeFlagChanges', () => {
  it('reports added, removed, renamed and changed-kind flags, each sorted by key', () => {
    const next: GeneratedFlag[] = [
      { key: 'checkout-v2', identifier: 'checkoutV2', kind: 'boolean' },
      { key: 'max-items', identifier: 'itemLimit', kind: 'number' },
      { key: 'checkout-config', identifier: 'checkoutConfig', kind: 'string' },
      { key: 'new-thing', identifier: 'newThing', kind: 'boolean' },
      { key: 'another', identifier: 'another', kind: 'boolean' },
    ];
    expect(summarizeFlagChanges(flags, next)).toBe(
      'flags: 2 added (another, new-thing), 1 removed (old-thing), 1 renamed (max-items: maxItems → itemLimit), 1 changed kind (checkout-config: json → string)',
    );
  });

  it('reports a flag that is both renamed and changed kind under each', () => {
    const next: GeneratedFlag[] = [{ key: 'old-thing', identifier: 'oldFlag', kind: 'string' }];
    expect(summarizeFlagChanges(flags.slice(3), next)).toBe(
      'flags: 1 renamed (old-thing: oldThing → oldFlag), 1 changed kind (old-thing: boolean → string)',
    );
  });

  it('reports a number flag switching between int and double', () => {
    const before: GeneratedFlag[] = [{ key: 'max-items', identifier: 'MaxItems', kind: 'number', numberType: 'double' }];
    const after: GeneratedFlag[] = [{ key: 'max-items', identifier: 'MaxItems', kind: 'number', numberType: 'int' }];
    expect(summarizeFlagChanges(before, after)).toBe('flags: 1 changed kind (max-items: number (double) → number (int))');
  });

  it('says so when no flag changed (for example a generator upgrade)', () => {
    expect(summarizeFlagChanges(flags, [...flags].reverse())).toBe('flags: no changes');
  });
});

describe('summarizeReadBack', () => {
  // A stand-in for an emitter whose output is one `key identifier kind` line per flag.
  const target = {
    readFlags: (text: string): GeneratedFlag[] | undefined =>
      text === 'garbage'
        ? undefined
        : text.split('\n').map((line) => {
            const [key, identifier, kind] = line.split(' ') as [string, string, GeneratedFlag['kind']];
            return { key, identifier, kind };
          }),
  };

  it('summarizes the flags read back from both sides', () => {
    expect(summarizeReadBack(target, 'a aOld boolean', 'a aNew boolean\nb b string')).toBe(
      'flags: 1 added (b), 1 renamed (a: aOld → aNew)',
    );
  });

  it('returns undefined when either side cannot be read back', () => {
    expect(summarizeReadBack(target, 'garbage', 'a a boolean')).toBeUndefined();
    expect(summarizeReadBack(target, 'a a boolean', 'garbage')).toBeUndefined();
  });

  it('returns undefined for a target that cannot read its output back', () => {
    expect(summarizeReadBack({}, 'a a boolean', 'a b boolean')).toBeUndefined();
  });
});
