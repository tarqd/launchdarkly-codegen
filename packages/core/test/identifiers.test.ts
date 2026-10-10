import { describe, expect, it } from 'vitest';
import {
  CodegenError,
  constantCase,
  ECMASCRIPT_RESERVED_WORDS,
  lowerCamel,
  nameFlags,
  type Flag,
  type FlagModel,
  type NamingRules,
} from '../src/index.js';
import { modelFlag, PROJECT_KEY } from './builders.js';

const rules: NamingRules = {
  target: 'ts-server',
  convert: lowerCamel,
  reserved: ECMASCRIPT_RESERVED_WORDS,
  pattern: /^[A-Za-z_$][A-Za-z0-9_$]*$/,
  ownNames: ['client'],
  derived: (name) => [`${name}Detail`],
};

const suggestion = 'set the custom property codegen.name.ts-server to choose a name';

function modelOf(...flags: Flag[]): FlagModel {
  return { projectKey: PROJECT_KEY, flags };
}

/** The names nameFlags gives these flags, by key. */
function namesOf(namingRules: NamingRules, ...flags: Flag[]): Record<string, string> {
  return Object.fromEntries([...nameFlags(modelOf(...flags), namingRules)].map(([flag, name]) => [flag.key, name]));
}

function failureOf(namingRules: NamingRules, ...flags: Flag[]): unknown {
  try {
    nameFlags(modelOf(...flags), namingRules);
  } catch (err) {
    return err;
  }
  throw new Error('expected nameFlags to throw');
}

describe('nameFlags', () => {
  it("names each flag by its converted key, or by the target's alias when it has one", () => {
    expect(
      namesOf(
        rules,
        modelFlag('checkout-v2.new_flow'),
        modelFlag('dark-mode', { aliases: { 'ts-server': 'nightMode', go: 'Ignored' } }),
      ),
    ).toEqual({ 'checkout-v2.new_flow': 'checkoutV2NewFlow', 'dark-mode': 'nightMode' });
  });

  it('accepts a flag whose derived names repeat its own name', () => {
    expect(namesOf({ ...rules, derived: (name) => [name, `${name}Detail`] }, modelFlag('checkout'))).toEqual({
      checkout: 'checkout',
    });
  });

  it('rejects a leading digit', () => {
    expect(failureOf(rules, modelFlag('2fa'))).toEqual(
      new CodegenError(`flag 2fa: ts-server identifier "2fa" starts with a digit; ${suggestion}`),
    );
  });

  it.each(['delete', 'class', 'await', 'yield', 'let', 'static', 'implements', 'package', 'enum', 'null', 'true'])(
    'rejects the reserved word %s',
    (word) => {
      expect(failureOf(rules, modelFlag(word))).toEqual(
        new CodegenError(`flag ${word}: ts-server identifier "${word}" is a reserved word; ${suggestion}`),
      );
    },
  );

  it('rejects a name that does not match the target pattern', () => {
    expect(failureOf(rules, modelFlag('---'))).toEqual(
      new CodegenError(`flag ---: ts-server identifier "" is not a valid identifier; ${suggestion}`),
    );
    expect(failureOf(rules, modelFlag('x', { aliases: { 'ts-server': 'my-name' } }))).toEqual(
      new CodegenError(`flag x: ts-server identifier "my-name" is not a valid identifier; ${suggestion}`),
    );
  });

  it("gives the target's reason for a name that does not match its pattern", () => {
    const capitals: NamingRules = { ...rules, invalidReason: 'must start with a capital' };
    expect(failureOf(capitals, modelFlag('x', { aliases: { 'ts-server': 'my-name' } }))).toEqual(
      new CodegenError(`flag x: ts-server identifier "my-name" must start with a capital; ${suggestion}`),
    );
  });

  it("checks derived names, after the flag's own name", () => {
    const constants: NamingRules = { ...rules, derived: (name) => [constantCase(name)] };
    // `_1x` is a valid name, but its constant `1X` starts with a digit.
    expect(failureOf(constants, modelFlag('x', { aliases: { 'ts-server': '_1x' } }))).toEqual(
      new CodegenError(`flag x: ts-server identifier "1X" starts with a digit; ${suggestion}`),
    );
    // `$` is a valid name, but its constant is empty.
    expect(failureOf(constants, modelFlag('x', { aliases: { 'ts-server': '$' } }))).toEqual(
      new CodegenError(`flag x: ts-server identifier "" is not a valid identifier; ${suggestion}`),
    );
    expect(failureOf(constants, modelFlag('2fa'))).toEqual(
      new CodegenError(`flag 2fa: ts-server identifier "2fa" starts with a digit; ${suggestion}`),
    );
  });

  it('reports a bad name before any collision', () => {
    expect(failureOf(rules, modelFlag('client'), modelFlag('delete'))).toEqual(
      new CodegenError(`flag delete: ts-server identifier "delete" is a reserved word; ${suggestion}`),
    );
  });

  it('names both flags when two names collide', () => {
    expect(failureOf(rules, modelFlag('checkout'), modelFlag('checkout-detail'))).toEqual(
      new CodegenError(
        'ts-server identifier "checkoutDetail" is produced by flags checkout and checkout-detail; set the custom property codegen.name.ts-server on one of them',
      ),
    );
  });

  it("reports a collision with one of the target's own names", () => {
    expect(failureOf(rules, modelFlag('client'))).toEqual(
      new CodegenError(
        'flag client: ts-server identifier "client" collides with a name the generator uses; set the custom property codegen.name.ts-server to choose a name',
      ),
    );
    expect(failureOf({ ...rules, ownNames: ['fooDetail'] }, modelFlag('foo'))).toEqual(
      new CodegenError(
        'flag foo: ts-server identifier "fooDetail" collides with a name the generator uses; set the custom property codegen.name.ts-server to choose a name',
      ),
    );
  });
});
