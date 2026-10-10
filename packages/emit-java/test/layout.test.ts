import { describe, expect, it } from 'vitest';
import { callLines, constantLines, signatureLines } from '../src/layout.js';

/** `n` columns of `a`, after the one-character `prefix`. */
const name = (prefix: string, n: number) => prefix + 'a'.repeat(n - 1);
/** The column each line ends at when written at `indent`, with the continuation indent it carries. */
const widths = (lines: string[], indent: number) => lines.map((l) => indent + l.length);

const PARAMS = ['LDContext context', 'boolean fallback'];

// Expected layouts were produced by running google-java-format 1.37.0 on the same declarations.
describe('signatureLines (google-java-format 1.37.0 layout)', () => {
  it('keeps a signature ending exactly at column 100 on one line', () => {
    // `  public boolean ` + name + `(LDContext context, boolean fallback) {` = 2 + 15 + 44 + 39
    const lines = signatureLines({ head: 'public boolean', name: name('m', 44), params: PARAMS }, 2);
    expect(lines).toEqual([`public boolean ${name('m', 44)}(LDContext context, boolean fallback) {`]);
    expect(widths(lines, 2)).toEqual([100]);
  });

  it('breaks a signature reaching column 101 after "(", the parameters on one line 4 deeper', () => {
    expect(signatureLines({ head: 'public boolean', name: name('m', 45), params: PARAMS }, 2)).toEqual([
      `public boolean ${name('m', 45)}(`,
      '    LDContext context, boolean fallback) {',
    ]);
  });

  it('keeps the parameters on one line when that line ends exactly at column 100', () => {
    const params = ['LDContext context', `boolean ${name('f', 64)}`];
    const lines = signatureLines({ head: 'public boolean', name: 'p', params }, 2);
    expect(lines).toEqual(['public boolean p(', `    LDContext context, boolean ${name('f', 64)}) {`]);
    expect(widths(lines, 2)).toEqual([19, 100]);
  });

  it('puts one parameter per line when the parameter line would reach column 101', () => {
    const params = ['LDContext context', `boolean ${name('f', 65)}`];
    expect(signatureLines({ head: 'public boolean', name: 'p', params }, 2)).toEqual([
      'public boolean p(',
      '    LDContext context,',
      `    boolean ${name('f', 65)}) {`,
    ]);
  });

  it('keeps the name on the first line when "head name(" ends exactly at column 100', () => {
    // 2 + `public boolean ` (15) + name (82) + `(` = 100
    expect(signatureLines({ head: 'public boolean', name: name('h', 82), params: PARAMS }, 2)).toEqual([
      `public boolean ${name('h', 82)}(`,
      '    LDContext context, boolean fallback) {',
    ]);
  });

  it('breaks after the return type when "head name(" would reach column 101, the parameters 8 deeper', () => {
    expect(signatureLines({ head: 'public boolean', name: name('h', 83), params: PARAMS }, 2)).toEqual([
      'public boolean',
      `    ${name('h', 83)}(`,
      '        LDContext context, boolean fallback) {',
    ]);
  });

  it('after a break at the return type, keeps the parameters on one line up to exactly column 100', () => {
    const params = ['LDContext context', `boolean ${name('f', 60)}`];
    const lines = signatureLines({ head: 'public boolean', name: name('g', 90), params }, 2);
    expect(lines).toEqual([
      'public boolean',
      `    ${name('g', 90)}(`,
      `        LDContext context, boolean ${name('f', 60)}) {`,
    ]);
    expect(widths(lines, 2)[2]).toBe(100);
  });

  it('after a break at the return type, puts one parameter per line past column 100', () => {
    const params = ['LDContext context', `boolean ${name('f', 61)}`];
    expect(signatureLines({ head: 'public boolean', name: name('g', 90), params }, 2)).toEqual([
      'public boolean',
      `    ${name('g', 90)}(`,
      '        LDContext context,',
      `        boolean ${name('f', 61)}) {`,
    ]);
  });
});

/** `Keys.` and a constant name of `n` columns. */
const key = (n: number) => `Keys.${'A'.repeat(n)}`;
const call = (n: number) => ({ head: 'return client.boolVariation', args: [key(n), 'context', 'fallback'] });

describe('callLines (google-java-format 1.37.0 layout)', () => {
  it('keeps a call ending exactly at column 100 on one line', () => {
    // 4 + `return client.boolVariation(Keys.` (33) + 42 + `, context, fallback);` (21) = 100
    const lines = callLines(call(42), 4);
    expect(lines).toEqual([`return client.boolVariation(${key(42)}, context, fallback);`]);
    expect(widths(lines, 4)).toEqual([100]);
  });

  it('breaks a call reaching column 101 after "(", the arguments on one line 4 deeper', () => {
    expect(callLines(call(43), 4)).toEqual(['return client.boolVariation(', `    ${key(43)}, context, fallback);`]);
  });

  it('keeps the arguments on one line when that line ends exactly at column 100', () => {
    // 4 + 4 + 5 + 66 + 21 = 100
    expect(widths(callLines(call(66), 4), 4)).toEqual([32, 100]);
  });

  it('puts one argument per line when the argument line would reach column 101', () => {
    expect(callLines(call(67), 4)).toEqual([
      'return client.boolVariation(',
      `    ${key(67)},`,
      '    context,',
      '    fallback);',
    ]);
  });

  it('keeps a qualified argument whole when its own line ends exactly at column 100', () => {
    // 4 + 4 + 5 + 86 + `,` = 100
    expect(callLines(call(86), 4)[1]).toBe(`    ${key(86)},`);
  });

  it('breaks a qualified argument reaching column 101 before its ".", the name 4 deeper still', () => {
    expect(callLines(call(87), 4)).toEqual([
      'return client.boolVariation(',
      '    Keys',
      `        .${'A'.repeat(87)},`,
      '    context,',
      '    fallback);',
    ]);
  });
});

const HEAD = 'public static final String';
const constant = (n: number, value = '"k"', annotation?: string) => ({
  ...(annotation === undefined ? {} : { annotation }),
  head: HEAD,
  name: 'A'.repeat(n),
  value,
});

describe('constantLines (google-java-format 1.37.0 layout)', () => {
  it('keeps a constant ending exactly at column 100 on one line', () => {
    const lines = constantLines(constant(62), 4);
    expect(lines).toEqual([`${HEAD} ${'A'.repeat(62)} = "k";`]);
    expect(widths(lines, 4)).toEqual([100]);
  });

  it('breaks a constant reaching column 101 after "=", the literal 4 deeper', () => {
    expect(constantLines(constant(63), 4)).toEqual([`${HEAD} ${'A'.repeat(63)} =`, '    "k";']);
  });

  it('lets a literal too long for its own line overflow', () => {
    const value = `"${'k'.repeat(90)}"`;
    expect(constantLines({ head: HEAD, name: 'L', value }, 4)).toEqual([`${HEAD} L =`, `    ${value};`]);
  });

  it('keeps @Deprecated on the same line while the constant ends by column 100', () => {
    expect(constantLines(constant(50, '"k"', '@Deprecated'), 4)).toEqual([
      `@Deprecated ${HEAD} ${'A'.repeat(50)} = "k";`,
    ]);
  });

  it('moves @Deprecated to its own line when the constant would reach column 101', () => {
    expect(constantLines(constant(51, '"k"', '@Deprecated'), 4)).toEqual([
      '@Deprecated',
      `${HEAD} ${'A'.repeat(51)} = "k";`,
    ]);
  });

  it('lays out the rest of a deprecated constant on its own, breaking after "=" past column 100', () => {
    const value = `"${'k'.repeat(12)}"`;
    expect(constantLines(constant(51, value, '@Deprecated'), 4)).toEqual([
      '@Deprecated',
      `${HEAD} ${'A'.repeat(51)} = ${value};`,
    ]);
    expect(constantLines(constant(52, value, '@Deprecated'), 4)).toEqual([
      '@Deprecated',
      `${HEAD} ${'A'.repeat(52)} =`,
      `    ${value};`,
    ]);
  });

  it('keeps the name on the first line when "head NAME =" ends exactly at column 100', () => {
    expect(widths(constantLines(constant(67), 4), 4)).toEqual([100, 12]);
  });

  it('breaks after the type when "head NAME =" would reach column 101, the name 4 deeper', () => {
    expect(constantLines(constant(68), 4)).toEqual([HEAD, `    ${'A'.repeat(68)} = "k";`]);
  });

  it('after a break at the type, keeps "NAME = literal;" whole up to exactly column 100', () => {
    expect(widths(constantLines(constant(85), 4), 4)).toEqual([30, 100]);
  });

  it('after a break at the type, breaks after "=" past column 100, the literal 8 deeper', () => {
    expect(constantLines(constant(86), 4)).toEqual([HEAD, `    ${'A'.repeat(86)} =`, '        "k";']);
  });
});
