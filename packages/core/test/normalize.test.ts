import { describe, expect, it } from 'vitest';
import { CodegenError, normalize, type ApiFlag, type Snapshot } from '../src/index.js';

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

function mvFlag(key: string, values: unknown[], extra: Partial<ApiFlag> = {}): ApiFlag {
  return { ...boolFlag(key), kind: 'multivariate', variations: values.map((value) => ({ value })), ...extra };
}

function numberProp(value: string[]): NonNullable<ApiFlag['customProperties']> {
  return { 'codegen.number': { name: 'codegen.number', value } };
}

describe('normalize: flag kind', () => {
  it('infers string for a multivariate flag with only string values', () => {
    const [flag] = normalize(snapshot([mvFlag('tier', ['free', 'pro'])])).flags;
    expect(flag?.kind).toBe('string');
  });

  it('infers number for a multivariate flag with only number values', () => {
    const [flag] = normalize(snapshot([mvFlag('limit', [1, 2.5, -3])])).flags;
    expect(flag?.kind).toBe('number');
  });

  it('infers json for objects, arrays and null without a warning', () => {
    const warnings: string[] = [];
    const model = normalize(
      snapshot([mvFlag('obj', [{ a: 1 }, { b: [2] }]), mvFlag('arr', [[1], ['x']]), mvFlag('nul', [null, {}])]),
      { warn: (m) => warnings.push(m) },
    );
    expect(model.flags.map((f) => [f.key, f.kind])).toEqual([
      ['arr', 'json'],
      ['nul', 'json'],
      ['obj', 'json'],
    ]);
    expect(warnings).toEqual([]);
  });

  it('infers json for mixed primitive values and warns naming the flag', () => {
    const warnings: string[] = [];
    const model = normalize(snapshot([mvFlag('mixed', ['a', 1])]), { warn: (m) => warnings.push(m) });
    expect(model.flags[0]?.kind).toBe('json');
    expect(warnings).toEqual(['flag mixed: variations mix value types (string, number); treating it as json']);
  });

  it('gives number flags numberType double by default and other kinds none', () => {
    const model = normalize(snapshot([mvFlag('limit', [1, 2]), mvFlag('tier', ['a', 'b'])]));
    expect(model.flags.map((f) => [f.key, f.numberType])).toEqual([
      ['limit', 'double'],
      ['tier', undefined],
    ]);
    expect(model.flags[1]).not.toHaveProperty('numberType');
  });

  it('sets numberType int from codegen.number: int', () => {
    const [flag] = normalize(
      snapshot([mvFlag('limit', [0, -2147483648, 2147483647], { customProperties: numberProp(['int']) })]),
    ).flags;
    expect(flag?.numberType).toBe('int');
  });

  it('treats an empty codegen.number as unset', () => {
    const [flag] = normalize(snapshot([mvFlag('limit', [1.5], { customProperties: numberProp([]) })])).flags;
    expect(flag?.numberType).toBe('double');
  });

  it.each([
    [1.5, '1.5'],
    [2147483648, '2147483648'],
    [-2147483649, '-2147483649'],
  ])('fails codegen.number: int when a variation is %s, naming the flag and value', (value, shown) => {
    const flag = mvFlag('limit', [1, value], { customProperties: numberProp(['int']) });
    expect(() => normalize(snapshot([flag]))).toThrow(
      new CodegenError(`flag limit: codegen.number is int but variation value ${shown} is not a 32-bit integer`),
    );
  });

  it('fails codegen.number with more than one value, naming the flag and property', () => {
    const flag = mvFlag('limit', [1], { customProperties: numberProp(['int', 'double']) });
    expect(() => normalize(snapshot([flag]))).toThrow(
      new CodegenError('flag limit: custom property codegen.number must have exactly one value, got 2'),
    );
  });

  it('fails codegen.number with a value other than int', () => {
    const flag = mvFlag('limit', [1], { customProperties: numberProp(['long']) });
    expect(() => normalize(snapshot([flag]))).toThrow(
      new CodegenError('flag limit: custom property codegen.number must be "int", got "long"'),
    );
  });

  it('keeps boolean flags boolean', () => {
    const [flag] = normalize(snapshot([boolFlag('on')])).flags;
    expect(flag?.kind).toBe('boolean');
  });

  it('fails a boolean flag with a non-boolean value, naming the flag', () => {
    const bad = boolFlag('bad-bool', { variations: [{ value: true }, { value: 'no' }] });
    expect(() => normalize(snapshot([bad]))).toThrow(
      new CodegenError('flag bad-bool: boolean flag has a non-boolean variation value "no"'),
    );
  });
});

describe('tag filter', () => {
  const flags = [
    boolFlag('both', { tags: ['billing', 'checkout', 'q3'] }),
    boolFlag('checkout-only', { tags: ['checkout'] }),
    boolFlag('billing-only', { tags: ['billing'] }),
    boolFlag('untagged'),
  ];
  const keys = (model: { flags: { key: string }[] }) => model.flags.map((f) => f.key);

  it('keeps only flags that have every configured tag, as filter=tags:a+b does on the server', () => {
    expect(keys(normalize(snapshot(flags), { tags: ['checkout', 'billing'] }))).toEqual(['both']);
    expect(keys(normalize(snapshot(flags), { tags: ['checkout'] }))).toEqual(['both', 'checkout-only']);
  });

  it('drops flags the server returned that do not match the tags the snapshot was fetched with', () => {
    const recorded = { ...snapshot(flags), tags: ['checkout'] };
    expect(keys(normalize(recorded))).toEqual(['both', 'checkout-only']);
  });

  it('keeps every flag when no tags are configured', () => {
    expect(keys(normalize(snapshot(flags), { tags: [] }))).toHaveLength(4);
  });
});

describe('view filter', () => {
  const flags = [boolFlag('a'), boolFlag('b'), boolFlag('c')];
  const keys = (model: { flags: { key: string }[] }) => model.flags.map((f) => f.key);

  it("keeps only flags whose key is among the snapshot view's members", () => {
    const recorded = { ...snapshot(flags), view: { key: 'payments', memberKeys: ['c', 'a'] } };
    expect(keys(normalize(recorded))).toEqual(['a', 'c']);
  });

  it('ignores a member key that is missing from the flags list', () => {
    const recorded = { ...snapshot(flags), view: { key: 'payments', memberKeys: ['b', 'deleted-flag'] } };
    expect(keys(normalize(recorded))).toEqual(['b']);
  });

  it('keeps no flags for a view with no members', () => {
    const recorded = { ...snapshot(flags), view: { key: 'payments', memberKeys: [] } };
    expect(normalize(recorded).flags).toEqual([]);
  });

  it('still drops archived members', () => {
    const recorded = {
      ...snapshot([boolFlag('a', { archived: true }), boolFlag('b')]),
      view: { key: 'payments', memberKeys: ['a', 'b'] },
    };
    expect(keys(normalize(recorded))).toEqual(['b']);
  });

  it('accepts a configured view that matches the snapshot', () => {
    const recorded = { ...snapshot(flags), view: { key: 'payments', memberKeys: ['a'] } };
    expect(keys(normalize(recorded, { view: 'payments' }))).toEqual(['a']);
  });

  it('rejects a configured view the snapshot was not fetched with, as exit 2', () => {
    expect(() => normalize(snapshot(flags), { view: 'payments' })).toThrow(CodegenError);
    expect(() => normalize(snapshot(flags), { view: 'payments' })).toThrow(/snapshot has no view/);
    const other = { ...snapshot(flags), view: { key: 'billing', memberKeys: ['a'] } };
    expect(() => normalize(other, { view: 'payments' })).toThrow(/view `billing`/);
  });
});
