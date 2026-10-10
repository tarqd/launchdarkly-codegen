import { describe, expect, it } from 'vitest';
import { parseTargetOptions } from '@launchtarqly/core';
import { javaEmitter } from '../src/index.js';

/** The java options parsed from a target's keys; a failure throws `<key> <message>`. */
function parse(raw: Record<string, unknown>) {
  return parseTargetOptions(javaEmitter.options!, raw, (key, message) => {
    throw new Error(`${key} ${message}`);
  });
}

describe('java target options', () => {
  it('declares no out extension, since out is a directory', () => {
    expect(javaEmitter.outExtensions).toBeUndefined();
  });

  it('requires a package', () => {
    expect(() => parse({})).toThrow('package is required (for example com.example.flags)');
  });

  it('rejects a package that is not a string', () => {
    expect(() => parse({ package: 42 })).toThrow('package must be a string, got 42');
  });

  it.each([
    ['an empty string', ''],
    ['an empty segment', 'com..flags'],
    ['a trailing dot', 'com.example.'],
    ['a segment starting with a digit', 'com.1example'],
    ['a hyphen', 'com.my-company.flags'],
    ['a reserved word', 'com.example.int'],
    ['a literal', 'com.true.flags'],
    ['a lone underscore', 'com._.flags'],
  ])('rejects a package with %s', (_case, pkg) => {
    expect(() => parse({ package: pkg })).toThrow(
      `package must be dot-separated Java identifiers, each matching [A-Za-z_$][A-Za-z0-9_$]* and not a reserved word, got ${JSON.stringify(pkg)}`,
    );
  });

  it('accepts identifiers with $ and _', () => {
    expect(parse({ package: 'com.$gen._flags' })).toEqual({ package: 'com.$gen._flags' });
  });
});
