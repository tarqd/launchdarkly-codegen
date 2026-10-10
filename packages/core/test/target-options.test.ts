import { describe, expect, expectTypeOf, it } from 'vitest';
import { parseTargetOptions, targetOption, type OptionValues } from '../src/index.js';

const OPTIONS = {
  package: targetOption({
    type: 'string',
    required: true,
    description: 'The package.',
    example: 'ldflags',
    parse: (value, fail) => (value === value.toLowerCase() ? value : fail(`must be lowercase, got ${JSON.stringify(value)}`)),
  }),
  limit: targetOption({ type: 'number', required: false, description: 'A limit.', example: '3' }),
};

/** Parses `raw`, turning a failure into `<key> <message>` so tests can match it. */
function parse(raw: Record<string, unknown>) {
  return parseTargetOptions(OPTIONS, raw, (key, message) => {
    throw new Error(`${key} ${message}`);
  });
}

describe('parseTargetOptions', () => {
  it('returns each option parsed, leaving a missing optional one undefined', () => {
    expect(parse({ package: 'ldflags' })).toEqual({ package: 'ldflags', limit: undefined });
    expect(parse({ package: 'ldflags', limit: 3 })).toEqual({ package: 'ldflags', limit: 3 });
  });

  it('infers the options type from the declarations', () => {
    expectTypeOf(parse({ package: 'ldflags' })).toEqualTypeOf<OptionValues<typeof OPTIONS>>();
    expectTypeOf<OptionValues<typeof OPTIONS>>().toEqualTypeOf<{ package: string; limit: number | undefined }>();
  });

  it('ignores keys that are not options', () => {
    expect(parse({ id: 'go', out: 'flags.go', package: 'ldflags' })).toEqual({ package: 'ldflags', limit: undefined });
  });

  it('fails on a missing required option, giving its example', () => {
    expect(() => parse({})).toThrow('package is required (for example ldflags)');
  });

  it('fails on a value of the wrong type before parsing it', () => {
    expect(() => parse({ package: 7 })).toThrow('package must be a string, got 7');
    expect(() => parse({ package: 'ldflags', limit: '3' })).toThrow('limit must be a number, got "3"');
  });

  it("passes the option's own failures through", () => {
    expect(() => parse({ package: 'LdFlags' })).toThrow('package must be lowercase, got "LdFlags"');
  });
});
