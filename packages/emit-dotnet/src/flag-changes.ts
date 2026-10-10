/**
 * Reads dotnet output back into flags, for `check`'s summary
 * (`Emitter.readFlags`). The old side is whatever is on disk, so this
 * parses text rather than trusting a Flag model.
 */

import type { GeneratedFlag } from '@launchtarqly/core';
import { IDENTIFIER as ID } from './identifier.js';
import {
  CLIENT_FIELD,
  FLAG_KEYS_CLASS,
  FLAG_KEYS_DECLARATION,
  KEY_CONSTANT_PREFIX,
  kindOfSdkMethod,
  SDK_METHODS,
} from './output.js';

const STRING = String.raw`"(?:[^"\\\n]|\\.)*"`;

/** `text` matched literally inside a RegExp, with any run of spaces matching any whitespace. */
function pattern(text: string): string {
  return text
    .split(' ')
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join(String.raw`\s+`);
}

// `return _client.<Kind>Variation(FlagKeys.<Name>, ...`. `Variation\s*\(` skips the `...VariationDetail(` methods.
const CALL = new RegExp(
  String.raw`${pattern(CLIENT_FIELD)}\.(${SDK_METHODS.join('|')})\s*\(\s*${pattern(FLAG_KEYS_CLASS)}\.(${ID})\s*,`,
  'gu',
);
const CONSTANT = new RegExp(String.raw`^${pattern(KEY_CONSTANT_PREFIX)}\s+(${ID})\s*=\s*(${STRING})\s*;$`, 'u');
const KEYS = new RegExp(String.raw`\n[ \t]*${pattern(FLAG_KEYS_DECLARATION)}\s*\{\r?\n([\s\S]*?)\r?\n[ \t]*\}`);
/** Lines `FlagKeys` may hold besides its constants: doc comments, `#if` directives and attributes. */
const SKIPPED = /^(?:$|\/\/|#|\[)/;

function unquote(literal: string): string {
  return literal.slice(1, -1).replace(/\\(.)/g, '$1');
}

/**
 * The flags in a dotnet file, in `FlagKeys` order (the identifier is the
 * `FlagKeys` constant, which is also the evaluation method's name), or
 * `undefined` when the file doesn't look like dotnet output. Tolerates doc
 * comments, `[Obsolete]` attributes and every flag kind (a number flag keeps
 * its `int` or `double` type); anything else unexpected in `FlagKeys` makes it
 * unparseable.
 */
export function parseDotnetFlags(text: string): GeneratedFlag[] | undefined {
  const block = KEYS.exec(text);
  if (!block) return undefined;

  const kinds = new Map<string, Pick<GeneratedFlag, 'kind' | 'numberType'>>();
  for (const [, method, name] of text.matchAll(CALL)) kinds.set(name!, kindOfSdkMethod(method!)!);

  const flags: GeneratedFlag[] = [];
  for (const raw of block[1]!.split('\n')) {
    const line = raw.trim();
    if (SKIPPED.test(line)) continue;
    const entry = CONSTANT.exec(line);
    if (!entry) return undefined;
    const identifier = entry[1]!;
    const kind = kinds.get(identifier);
    if (!kind) return undefined;
    flags.push({ key: unquote(entry[2]!), identifier, ...kind });
  }
  return flags;
}
