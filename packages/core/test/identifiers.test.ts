import { describe, expect, it } from 'vitest';
import { checkIdentifiers, CodegenError, ECMASCRIPT_RESERVED_WORDS, type IdentifierRules } from '../src/index.js';

const rules: IdentifierRules = {
  target: 'ts-server',
  reserved: ECMASCRIPT_RESERVED_WORDS,
  pattern: /^[A-Za-z_$][A-Za-z0-9_$]*$/,
};

const suggestion = 'set the custom property codegen.name.ts-server to choose a name';

describe('checkIdentifiers', () => {
  it('accepts distinct valid identifiers, and repeats within one flag', () => {
    expect(() =>
      checkIdentifiers(rules, [
        { flagKey: 'checkout', identifier: 'checkout', primary: true },
        { flagKey: 'checkout', identifier: 'checkoutDetail' },
        { flagKey: 'checkout', identifier: 'checkout' },
        { flagKey: 'dark-mode', identifier: 'darkMode', primary: true },
      ]),
    ).not.toThrow();
  });

  it('rejects a leading digit', () => {
    expect(() => checkIdentifiers(rules, [{ flagKey: '2fa', identifier: '2fa', primary: true }])).toThrow(
      new CodegenError(`flag 2fa: ts-server identifier "2fa" starts with a digit; ${suggestion}`),
    );
  });

  it.each(['delete', 'class', 'await', 'yield', 'let', 'static', 'implements', 'package', 'enum', 'null', 'true'])(
    'rejects the reserved word %s',
    (word) => {
      expect(() => checkIdentifiers(rules, [{ flagKey: word, identifier: word, primary: true }])).toThrow(
        new CodegenError(`flag ${word}: ts-server identifier "${word}" is a reserved word; ${suggestion}`),
      );
    },
  );

  it('rejects an identifier that does not match the target pattern', () => {
    expect(() => checkIdentifiers(rules, [{ flagKey: '---', identifier: '', primary: true }])).toThrow(
      new CodegenError(`flag ---: ts-server identifier "" is not a valid identifier; ${suggestion}`),
    );
    expect(() => checkIdentifiers(rules, [{ flagKey: 'x', identifier: 'my-name', primary: true }])).toThrow(
      new CodegenError(`flag x: ts-server identifier "my-name" is not a valid identifier; ${suggestion}`),
    );
  });

  it('names both flags when two identifiers collide', () => {
    expect(() =>
      checkIdentifiers(rules, [
        { flagKey: 'checkout', identifier: 'checkout', primary: true },
        { flagKey: 'checkout', identifier: 'checkoutDetail' },
        { flagKey: 'checkout-detail', identifier: 'checkoutDetail', primary: true },
      ]),
    ).toThrow(
      new CodegenError(
        'ts-server identifier "checkoutDetail" is produced by flags checkout and checkout-detail; set the custom property codegen.name.ts-server on one of them',
      ),
    );
  });

  it('reports a collision with a name the target generates itself', () => {
    expect(() =>
      checkIdentifiers(rules, [
        { identifier: 'client' },
        { flagKey: 'client', identifier: 'client', primary: true },
      ]),
    ).toThrow(
      new CodegenError(
        'flag client: ts-server identifier "client" collides with a name the generator uses; set the custom property codegen.name.ts-server to choose a name',
      ),
    );
  });
});
