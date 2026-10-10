import { describe, expect, it } from 'vitest';
import { summarizeFlagChanges, type GeneratedFlag } from '../src/index.js';

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

  it('reports a number flag whose number type changed, when both sides know it', () => {
    const before: GeneratedFlag[] = [{ key: 'max-items', identifier: 'MaxItems', kind: 'number', numberType: 'double' }];
    const after: GeneratedFlag[] = [{ key: 'max-items', identifier: 'MaxItems', kind: 'number', numberType: 'int' }];
    expect(summarizeFlagChanges(before, after)).toBe(
      'flags: 1 changed kind (max-items: number (double) → number (int))',
    );
  });

  it('ignores the number type when either side does not know it', () => {
    const known: GeneratedFlag[] = [{ key: 'max-items', identifier: 'maxItems', kind: 'number', numberType: 'int' }];
    expect(summarizeFlagChanges(flags.slice(1, 2), known)).toBe('flags: no changes');
    expect(summarizeFlagChanges(known, flags.slice(1, 2))).toBe('flags: no changes');
  });

  it('says so when no flag changed (for example a generator upgrade)', () => {
    expect(summarizeFlagChanges(flags, [...flags].reverse())).toBe('flags: no changes');
  });
});
