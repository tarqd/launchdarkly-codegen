import { describe, expect, it } from 'vitest';
import { escapeJavadoc, javadocLines } from '../src/javadoc.js';

describe('escapeJavadoc', () => {
  it('escapes the HTML metacharacters, ampersand first', () => {
    expect(escapeJavadoc('a < b && c > d &amp;')).toBe('a &lt; b &amp;&amp; c &gt; d &amp;amp;');
  });

  it('breaks every */ so user text cannot close the comment', () => {
    expect(escapeJavadoc('/cart/**/*.json */')).toBe('/cart/**&#47;*.json *&#47;');
  });

  it('escapes backslashes, since javac reads \\u as a unicode escape inside comments', () => {
    expect(escapeJavadoc('C:\\users and \\u002a/')).toBe('C:&#92;users and &#92;u002a/');
  });

  it('escapes @ where it starts a word or follows {, leaving addresses readable', () => {
    expect(escapeJavadoc('@since 2 is not a tag,\n@param neither, nor {@code x}; mail ada@example.com')).toBe(
      '&#64;since 2 is not a tag,\n&#64;param neither, nor {&#64;code x}; mail ada@example.com',
    );
  });
});

/** Nine ten-column words and a five-column one: 95 columns, which at indent 2 ends exactly at column 100. */
const NINETY_FIVE = `${'xxxxxxxxx '.repeat(9)}yyyyy`;

// Expected layouts were produced by running google-java-format 1.37.0 on the same text.
describe('javadocLines (google-java-format 1.37.0 layout)', () => {
  it('collapses a comment that fits to one line, up to exactly column 100', () => {
    expect(javadocLines({ paragraphs: ['Not instantiable.'] }, 4)).toEqual(['/** Not instantiable. */']);
    expect(javadocLines({ paragraphs: ['z'.repeat(91)] }, 2)).toEqual([`/** ${'z'.repeat(91)} */`]);
    expect(javadocLines({ paragraphs: ['z'.repeat(92)] }, 2)).toEqual(['/**', ` * ${'z'.repeat(92)}`, ' */']);
  });

  it('never collapses a comment with block tags', () => {
    expect(javadocLines({ paragraphs: [], tags: ['@deprecated x'] }, 2)).toEqual(['/**', ' * @deprecated x', ' */']);
  });

  it('joins source lines and fills to column 100, counting the indent and " * "', () => {
    expect(javadocLines({ paragraphs: [`${NINETY_FIVE}\nnext\n  more`] }, 2)).toEqual([
      '/**',
      ` * ${NINETY_FIVE}`,
      ' * next more',
      ' */',
    ]);
  });

  it('starts each later paragraph with <p> after a bare " *", and the block tags likewise', () => {
    expect(
      javadocLines({ paragraphs: ['Checkout V2', 'Routes users.', 'Second.'], tags: ['@param a b', '@return c'] }, 2),
    ).toEqual([
      '/**',
      ' * Checkout V2',
      ' *',
      ' * <p>Routes users.',
      ' *',
      ' * <p>Second.',
      ' *',
      ' * @param a b',
      ' * @return c',
      ' */',
    ]);
  });

  it('puts a word longer than the room alone on its line, overflowing', () => {
    const url = `https://app.launchdarkly.com/projects/p/flags/${'k'.repeat(80)}`;
    expect(javadocLines({ paragraphs: ['T', `see ${url} after`] }, 2)).toEqual([
      '/**',
      ' * T',
      ' *',
      ' * <p>see',
      ` * ${url}`,
      ' * after',
      ' */',
    ]);
  });

  it('ends the line at <br>', () => {
    expect(javadocLines({ paragraphs: ['T', 'key: {@code k}<br>\nhttps://example.com/x'] }, 2)).toEqual([
      '/**',
      ' * T',
      ' *',
      ' * <p>key: {@code k}<br>',
      ' * https://example.com/x',
      ' */',
    ]);
  });

  it('moves a <br> that passes column 100 to its own line, without its word', () => {
    const x = 'x'.repeat(88);
    expect(javadocLines({ paragraphs: ['T', `${x} zz<br>\nhttps://x`] }, 2)).toEqual([
      '/**',
      ' * T',
      ' *',
      ` * <p>${x} zz`,
      ' * <br>',
      ' * https://x',
      ' */',
    ]);
  });

  it('may split {@code k} after {@code', () => {
    const key = 'a'.repeat(89);
    expect(javadocLines({ paragraphs: ['T', `key: {@code ${key}} more`] }, 2)).toEqual([
      '/**',
      ' * T',
      ' *',
      ' * <p>key: {@code',
      ` * ${key}} more`,
      ' */',
    ]);
  });

  it('counts widths in UTF-16 code units', () => {
    const umlauts = `${'üüüüüüüüü '.repeat(9)}yyyyy next`;
    const emoji = `${'😀😀😀😀x '.repeat(9)}yyyyy next`;
    expect(javadocLines({ paragraphs: ['T', umlauts, emoji] }, 2)).toEqual([
      '/**',
      ' * T',
      ' *',
      ` * <p>${'üüüüüüüüü '.repeat(8)}üüüüüüüüü`,
      ' * yyyyy next',
      ' *',
      ` * <p>${'😀😀😀😀x '.repeat(8)}😀😀😀😀x`,
      ' * yyyyy next',
      ' */',
    ]);
  });

  it('indents block-tag continuation lines 4 more spaces', () => {
    expect(javadocLines({ paragraphs: ['a'], tags: [`@return ${NINETY_FIVE} tail`] }, 2)).toEqual([
      '/**',
      ' * a',
      ' *',
      ` * @return ${'xxxxxxxxx '.repeat(7)}xxxxxxxxx`,
      ' *     xxxxxxxxx yyyyy tail',
      ' */',
    ]);
  });
});
