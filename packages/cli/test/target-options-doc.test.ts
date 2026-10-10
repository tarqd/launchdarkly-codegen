import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Emitter } from '@launchtarqly/core';
import { BUILT_IN_EMITTERS } from '../src/index.js';

const DESIGN = readFileSync(resolve(import.meta.dirname, '../../../DESIGN.md'), 'utf8');

/** `a`, `a or b`, `a, b or c`, each in backticks. */
function orList(items: readonly string[]): string {
  const code = items.map((item) => `\`${item}\``);
  return code.length <= 1 ? code.join('') : `${code.slice(0, -1).join(', ')} or ${code[code.length - 1]}`;
}

/** The DESIGN.md → Target options rows an emitter's declarations give. */
function rows(emitter: Emitter): string[] {
  const out = emitter.outExtensions ? `a ${orList(emitter.outExtensions)} file` : 'a directory';
  const options = Object.entries(emitter.options ?? {});
  if (options.length === 0) return [`| \`${emitter.id}\` | ${out} | none | | |`];
  return options.map(
    ([key, option]) =>
      `| \`${emitter.id}\` | ${out} | \`${key}\`${option.required ? ' (required)' : ''} | ${option.description} | \`${option.example}\` |`,
  );
}

describe('DESIGN.md → Target options', () => {
  it("lists every built-in target's out and options as its emitter declares them", () => {
    const table = DESIGN.slice(DESIGN.indexOf('| Target | `out` | Option |'));
    const body = table.slice(0, table.indexOf('\n\n')).split('\n').slice(2);
    expect(body).toEqual(BUILT_IN_EMITTERS.flatMap(rows));
  });
});
