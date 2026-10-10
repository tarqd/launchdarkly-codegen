/**
 * The sanitizer that keeps flag names and descriptions gofmt-stable in Go doc
 * comments (DESIGN.md → go → Sanitizing doc text). The compile test fuzzes
 * the same rules against the real gofmt.
 */
import { describe, expect, it } from 'vitest';
import { methodDoc } from '../src/doc.js';
import { modelFlag } from '../../core/test/builders.js';

const TRAILER = ['key: "f"', 'https://app.launchdarkly.com/projects/my-project/flags/f'];

/** The primary method's doc lines for a flag with this name and description, trailer included. */
function doc(name: string, description: string): string[] {
  return methodDoc('F', modelFlag('f', { name, description }));
}

describe('go doc sanitizer', () => {
  it('drops control characters, NUL and BOM from the description', () => {
    expect(doc('Name', 'Routes\u0000 users\u0007 to\u001b the\u007f ﻿flow.')).toEqual([
      'F evaluates the "Name" flag.',
      '',
      'Routes users to the flow.',
      '',
      ...TRAILER,
    ]);
  });

  it('turns tabs into spaces and trims every line, so nothing becomes a code block or list', () => {
    expect(doc('Name', 'First line.\n\tfunc f() {\n    indented\n  - item  ')).toEqual([
      'F evaluates the "Name" flag.',
      '',
      'First line.',
      'func f() {',
      'indented',
      '- item',
      '',
      ...TRAILER,
    ]);
    expect(doc('Name', 'a\tb.')[2]).toBe('a b.');
  });

  it("rewrites `` to “ and '' to ”, as gofmt itself does", () => {
    expect(doc("Say ``hi''", "Use ``quoted'' text, don't ''panic''.")).toEqual([
      'F evaluates the "Say “hi”" flag.',
      '',
      'Use “quoted” text, don\'t ”panic”.',
      '',
      ...TRAILER,
    ]);
  });

  it('collapses runs of blank lines, whitespace-only lines and CR line ends included', () => {
    expect(doc('Name', '\n\nFirst.\r\n\r\n  \n\n\nSecond.\rStill second.\n\n')).toEqual([
      'F evaluates the "Name" flag.',
      '',
      'First.',
      '',
      'Second.',
      'Still second.',
      '',
      ...TRAILER,
    ]);
  });

  describe('joins a paragraph gofmt could reinterpret to the one before it', () => {
    it('a one-line description with no final period joins the summary paragraph', () => {
      expect(doc('Checkout V2', 'Routes eligible users')).toEqual([
        'F evaluates the "Checkout V2" flag.',
        'Routes eligible users',
        '',
        ...TRAILER,
      ]);
    });

    it('a lone heading-like line later in the description', () => {
      expect(doc('Name', 'Intro text.\n\nRollout Plan\n\nBody text.')).toEqual([
        'F evaluates the "Name" flag.',
        '',
        'Intro text.',
        'Rollout Plan',
        '',
        'Body text.',
        '',
        ...TRAILER,
      ]);
    });

    it("but not a line gofmt wouldn't take for a heading", () => {
      for (const line of ['Ends with a period.', 'lowercase start', 'Has: punctuation', "Don't stop", 'Stop. Go', 'Two\nlines']) {
        expect(doc('Name', `Intro.\n\n${line}`).slice(0, 4)).toEqual(['F evaluates the "Name" flag.', '', 'Intro.', '']);
      }
      // A possessive 's and a dot inside a word are still a heading.
      expect(doc('Name', "Intro.\n\nAda's v1.2 Plan")[3]).toBe("Ada's v1.2 Plan");
    });

    it('a block made only of [text]: link definitions', () => {
      expect(doc('Name', 'See [Docs].\n\n[Docs]: https://example.com/docs\n[API]: https://example.com/api')).toEqual([
        'F evaluates the "Name" flag.',
        '',
        'See [Docs].',
        '[Docs]: https://example.com/docs',
        '[API]: https://example.com/api',
        '',
        ...TRAILER,
      ]);
    });

    it('a paragraph starting Deprecated: ', () => {
      expect(doc('Name', 'Old flow.\n\nDeprecated: old\nstill here.')).toEqual([
        'F evaluates the "Name" flag.',
        '',
        'Old flow.',
        'Deprecated: old',
        'still here.',
        '',
        ...TRAILER,
      ]);
    });
  });

  it('puts the deprecation message on one line, cleaned like the name, falling back to the generic text when nothing is left', () => {
    const deprecated = (deprecationMessage: string) =>
      methodDoc('F', modelFlag('f', { deprecated: true, deprecationMessage })).at(-1);
    expect(deprecated("Use ``g''\n\n\tinstead.\u0000")).toBe('Deprecated: Use “g” instead.');
    expect(deprecated('\u0000 \n')).toBe('Deprecated: The "f" flag is deprecated.');
  });

  it('cleans a team maintainer name in the trailer', () => {
    const flag = modelFlag('f', { maintainer: { kind: 'team', key: 'pay', name: "Pay\nments ``A''" } });
    expect(methodDoc('F', flag)).toContain('key: "f" · maintainer: team Pay ments “A”');
  });

  it('puts the name on one line, cleaned like the description', () => {
    expect(doc('  Checkout\r\n  V2\n\n\tbeta\u0000﻿ ', '')).toEqual(['F evaluates the "Checkout V2 beta" flag.', '', ...TRAILER]);
  });
});
