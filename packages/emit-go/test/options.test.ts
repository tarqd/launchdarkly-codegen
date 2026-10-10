import { describe, expect, it } from 'vitest';
import { parseTargetOptions } from '@launchtarqly/core';
import { goEmitter } from '../src/index.js';

/** The go options parsed from a target's keys; a failure throws `<key> <message>`. */
function parse(raw: Record<string, unknown>) {
  return parseTargetOptions(goEmitter.options!, raw, (key, message) => {
    throw new Error(`${key} ${message}`);
  });
}

describe('go target options', () => {
  it('declares .go as the only out extension', () => {
    expect(goEmitter.outExtensions).toEqual(['.go']);
  });

  it('requires a package', () => {
    expect(() => parse({})).toThrow('package is required (for example ldflags)');
  });

  it.each([
    ['not a string', 7, 'must be a string, got 7'],
    ['empty', '', 'must be a lowercase Go identifier that is not a keyword, got ""'],
    ['not lowercase', 'LdFlags', 'must be a lowercase Go identifier that is not a keyword, got "LdFlags"'],
    ['not an identifier', 'ld-flags', 'must be a lowercase Go identifier'],
    ['starting with a digit', '1flags', 'must be a lowercase Go identifier'],
    ['a Go keyword', 'type', 'must be a lowercase Go identifier that is not a keyword, got "type"'],
  ])('rejects a package that is %s', (_name, pkg, message) => {
    expect(() => parse({ package: pkg })).toThrow(`package ${message}`);
  });

  it('accepts a lowercase package with digits and underscores', () => {
    expect(parse({ package: 'ld_flags2' })).toEqual({ package: 'ld_flags2' });
  });
});
