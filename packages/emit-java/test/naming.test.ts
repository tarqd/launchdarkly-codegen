import { describe, expect, it } from 'vitest';
import { CodegenError, type Flag } from '@launchtarqly/core';
import { flagNames } from '../src/naming.js';
import { modelFlag } from '../../core/test/builders.js';

function names(...flags: Flag[]) {
  const result = flagNames({ projectKey: 'my-project', flags });
  return flags.map((flag) => result.get(flag)!);
}

const aliased = (key: string, alias: string): Flag => modelFlag(key, { aliases: { java: alias } });

/** Expects naming `flags` to throw a CodegenError containing every fragment and suggesting a java: alias. */
function expectFailure(flags: Flag[], ...fragments: string[]): void {
  let error: unknown;
  try {
    names(...flags);
  } catch (e) {
    error = e;
  }
  expect(error).toBeInstanceOf(CodegenError);
  const message = (error as CodegenError).message;
  expect(message).toContain('java:<name>');
  for (const fragment of fragments) expect(message).toContain(fragment);
}

describe('java flag names', () => {
  it('converts the key to a lowerCamel method and a CONSTANT_CASE constant', () => {
    expect(names(modelFlag('checkout-v2.new_flow'), modelFlag('api-url-id'))).toEqual([
      { method: 'checkoutV2NewFlow', constant: 'CHECKOUT_V2_NEW_FLOW' },
      { method: 'apiUrlId', constant: 'API_URL_ID' },
    ]);
  });

  it('uses the java alias for both names', () => {
    expect(names(modelFlag('flag-one', { aliases: { java: 'myAlias', 'ts-server': 'tsName' } }))).toEqual([
      { method: 'myAlias', constant: 'MY_ALIAS' },
    ]);
  });

  it('allows contextual keywords other than yield', () => {
    expect(() => names(modelFlag('var'), modelFlag('record'), modelFlag('sealed'))).not.toThrow();
  });
});

describe('java naming failures', () => {
  it('a leading digit', () =>
    expectFailure([modelFlag('2fa-enabled')], 'flag 2fa-enabled: java identifier "2faEnabled" starts with a digit'));

  it.each([
    ['a keyword', 'class'],
    ['the keyword _', '_'],
    ['a literal', 'null'],
    ['yield', 'yield'],
    ['an Object method', 'hashCode'],
  ])('a reserved word: %s', (_case, alias) =>
    expectFailure([aliased('ok-flag', alias)], `flag ok-flag: java identifier "${alias}" is a reserved word`));

  it.each(['true', 'false', 'wait', 'notify', 'notifyAll', 'equals', 'toString', 'getClass', 'clone', 'finalize'])(
    'a reserved word converted from the key: %s',
    (key) => expectFailure([modelFlag(key)], `"${key}" is a reserved word`),
  );

  it.each(['not valid', 'é', '1abc', 'a-b'])('an invalid alias: %s', (alias) =>
    expectFailure([aliased('ok-flag', alias)], 'flag ok-flag: java identifier'));

  it('an alias whose constant would not be a valid identifier', () => expectFailure([aliased('ok-flag', '$')], 'flag ok-flag:'));

  it('a Detail variant colliding with another flag', () =>
    expectFailure(
      [modelFlag('checkout'), modelFlag('checkout-detail')],
      'java identifier "checkoutDetail" is produced by flags checkout and checkout-detail',
    ));

  it('a constant collision', () =>
    expectFailure(
      [modelFlag('api-url-id'), aliased('other-flag', 'apiURLId')],
      'java identifier "API_URL_ID" is produced by flags api-url-id and other-flag',
    ));

  it.each(['Flags', 'Keys', 'client'])('a collision with %s', (alias) =>
    expectFailure([aliased('ok-flag', alias)], `flag ok-flag: java identifier "${alias}" collides with a name the generator uses`));
});
