import { describe, expect, it } from 'vitest';
import { normalize, type ApiFlag, type Snapshot } from '../src/index.js';

function boolFlag(key: string, extra: Partial<ApiFlag> = {}): ApiFlag {
  return {
    key,
    name: key,
    kind: 'boolean',
    variations: [{ value: true }, { value: false }],
    archived: false,
    deprecated: false,
    tags: [],
    ...extra,
  };
}

function snapshot(...pages: ApiFlag[][]): Snapshot {
  return {
    snapshotVersion: 1,
    projectKey: 'my-project',
    baseUri: 'https://app.launchdarkly.com',
    flagPages: pages.map((items) => ({ items, totalCount: items.length })),
  };
}

describe('normalize', () => {
  it('maps a boolean flag into the Flag model', () => {
    const model = normalize(
      snapshot([
        boolFlag('checkout-v2', {
          name: 'Checkout V2',
          description: 'Routes eligible users to the rewritten checkout flow.',
          tags: ['checkout', 'q3'],
          clientSideAvailability: { usingEnvironmentId: true, usingMobileKey: false },
        }),
      ]),
    );
    expect(model).toEqual({
      projectKey: 'my-project',
      flags: [
        {
          key: 'checkout-v2',
          name: 'Checkout V2',
          description: 'Routes eligible users to the rewritten checkout flow.',
          kind: 'boolean',
          clientSideAvailability: { usingEnvironmentId: true, usingMobileKey: false },
          tags: ['checkout', 'q3'],
          deprecated: false,
          archived: false,
          aliases: {},
          uiUrl: 'https://app.launchdarkly.com/projects/my-project/flags/checkout-v2',
        },
      ],
    });
  });

  it('defaults a missing description to the empty string', () => {
    const [flag] = normalize(snapshot([boolFlag('a')])).flags;
    expect(flag?.description).toBe('');
  });

  it('drops archived flags', () => {
    const model = normalize(snapshot([boolFlag('kept'), boolFlag('gone', { archived: true })]));
    expect(model.flags.map((f) => f.key)).toEqual(['kept']);
  });

  it('sorts flags by key across pages', () => {
    const model = normalize(snapshot([boolFlag('zeta'), boolFlag('alpha')], [boolFlag('Beta')]));
    // Code-unit order, so the result does not depend on the machine's locale.
    expect(model.flags.map((f) => f.key)).toEqual(['Beta', 'alpha', 'zeta']);
  });
});
