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

  describe('maintainer', () => {
    it('maps _maintainer to a member with first + last as name', () => {
      const [flag] = normalize(
        snapshot([
          boolFlag('a', {
            _maintainer: { _id: 'm1', firstName: 'Ada', lastName: 'Lovelace', role: 'writer', email: 'ada@example.com' },
          }),
        ]),
      ).flags;
      expect(flag?.maintainer).toEqual({ kind: 'member', email: 'ada@example.com', name: 'Ada Lovelace' });
    });

    it('maps _maintainerTeam to a team', () => {
      const [flag] = normalize(
        snapshot([boolFlag('a', { maintainerTeamKey: 'payments', _maintainerTeam: { key: 'payments', name: 'Payments' } })]),
      ).flags;
      expect(flag?.maintainer).toEqual({ kind: 'team', key: 'payments', name: 'Payments' });
    });

    it('leaves the maintainer out when neither is present', () => {
      const [flag] = normalize(snapshot([boolFlag('a')])).flags;
      expect(flag).not.toHaveProperty('maintainer');
    });
  });

  describe('client-side availability', () => {
    it('falls back to includeInSnippet and mobile key true when absent', () => {
      const flags = normalize(
        snapshot([boolFlag('a', { includeInSnippet: true }), boolFlag('b')]),
      ).flags;
      expect(flags.map((f) => f.clientSideAvailability)).toEqual([
        { usingEnvironmentId: true, usingMobileKey: true },
        { usingEnvironmentId: false, usingMobileKey: true },
      ]);
    });
  });

  it('builds uiUrl from a non-default base URI', () => {
    const snap = { ...snapshot([boolFlag('checkout-v2')]), baseUri: 'https://app.eu.launchdarkly.com' };
    const [flag] = normalize(snap).flags;
    expect(flag?.uiUrl).toBe('https://app.eu.launchdarkly.com/projects/my-project/flags/checkout-v2');
  });

  describe('deprecation', () => {
    const codegenDeprecated = (...value: string[]) => ({
      customProperties: { 'codegen.deprecated': { name: 'codegen.deprecated', value } },
    });

    it('is deprecated, with no message, from the LaunchDarkly marker alone', () => {
      const [flag] = normalize(snapshot([boolFlag('a', { deprecated: true })])).flags;
      expect(flag?.deprecated).toBe(true);
      expect(flag).not.toHaveProperty('deprecationMessage');
    });

    it('is deprecated from codegen.deprecated alone, joining non-blank values', () => {
      const [flag] = normalize(
        snapshot([boolFlag('a', codegenDeprecated('Use checkout-v3.', '  ', '', 'Removal in Q4.'))]),
      ).flags;
      expect(flag?.deprecated).toBe(true);
      expect(flag?.deprecationMessage).toBe('Use checkout-v3. Removal in Q4.');
    });

    it('is deprecated from both signals, keeping the message', () => {
      const [flag] = normalize(
        snapshot([boolFlag('a', { deprecated: true, ...codegenDeprecated('Use checkout-v3.') })]),
      ).flags;
      expect(flag?.deprecated).toBe(true);
      expect(flag?.deprecationMessage).toBe('Use checkout-v3.');
    });

    it('is deprecated with no message when codegen.deprecated holds only blank values', () => {
      const [flag] = normalize(snapshot([boolFlag('a', codegenDeprecated(' '))])).flags;
      expect(flag?.deprecated).toBe(true);
      expect(flag).not.toHaveProperty('deprecationMessage');
    });

    it('is not deprecated without either signal', () => {
      const [flag] = normalize(snapshot([boolFlag('a')])).flags;
      expect(flag?.deprecated).toBe(false);
      expect(flag).not.toHaveProperty('deprecationMessage');
    });
  });
});
