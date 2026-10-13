import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Emitter } from '@launchtarqly/core';
import { BUILT_IN_EMITTERS, SETTINGS, type SettingSpec } from '../src/index.js';

const read = (path: string) => readFileSync(resolve(import.meta.dirname, '../../..', path), 'utf8');
const DESIGN = read('DESIGN.md');
const SITE_CONFIG = read('website/reference/configuration.md');

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

/** The body rows of the markdown table in `doc` whose header starts with `header`. */
function tableBody(doc: string, header: string): string[] {
  const table = doc.slice(doc.indexOf(header));
  return table.slice(0, table.indexOf('\n\n')).split('\n').slice(2);
}

/** The docs site's Configuration → Settings row a setting gives. */
function settingRow(s: SettingSpec): string {
  const key = `\`${s.key}\`${s.inFile ? '' : ' (not read from the file)'}`;
  const cells = [key, `\`--${s.flag}\``, `\`${s.env}\``, s.default === undefined ? '' : `\`${s.default}\``];
  return `|${cells.map((cell) => (cell ? ` ${cell} ` : ' ')).join('|')}|`;
}

describe('Target options tables', () => {
  for (const [name, doc] of [
    ['DESIGN.md', DESIGN],
    ['website/reference/configuration.md', SITE_CONFIG],
  ] as const) {
    it(`${name} lists every built-in target's out and options as its emitter declares them`, () => {
      expect(tableBody(doc, '| Target | `out` | Option |')).toEqual(BUILT_IN_EMITTERS.flatMap(rows));
    });
  }
});

describe('website/reference/configuration.md → Settings', () => {
  it('lists every setting with its flag, env var and default', () => {
    expect(tableBody(SITE_CONFIG, '| Config key | CLI flag |')).toEqual((SETTINGS as readonly SettingSpec[]).map(settingRow));
  });
});
