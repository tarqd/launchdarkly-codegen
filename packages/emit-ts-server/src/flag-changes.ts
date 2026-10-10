/**
 * Reads ts-server output back into flags, for `check`'s summary
 * (`Emitter.readFlags`). The old side is whatever is on disk, so this
 * parses text rather than trusting a Flag model.
 */

import type { FlagKind, GeneratedFlag } from '@launchtarqly/core';
import { AS_CONST, CLIENT_FIELD, FLAG_KEYS_OPEN, KIND_METHODS, kindOfSdkMethod } from './output.js';

/** `text` matched literally inside a RegExp. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const SDK_METHODS = Object.values(KIND_METHODS).map(({ method }) => method);

// `name(...): Promise<...> {` followed by `return this.client.<kind>Variation(`.
// `Variation\s*\(` skips the `...VariationDetail(` methods. Signatures may wrap.
const METHOD = new RegExp(
  String.raw`(?:^|\n)[ \t]*(\w+)[ \t]*\([^{;]*?\{\s*return\s+this\.${CLIENT_FIELD}\.(${SDK_METHODS.join('|')})\s*\(`,
  'g',
);
const KEYS = new RegExp(String.raw`\n${escapeRegExp(FLAG_KEYS_OPEN)}\n([\s\S]*?)\n\}(?:${escapeRegExp(AS_CONST)})?;`);

const STRING = String.raw`'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"`;
const ENTRY = new RegExp(String.raw`^(\w+|${STRING})\s*:\s*(${STRING})\s*,?$`);

function unquote(literal: string): string {
  return literal.slice(1, -1).replace(/\\(.)/g, '$1');
}

/**
 * The flags in a ts-server file, in `FlagKeys` order (the identifier is the
 * `FlagKeys` property, which is also the evaluation method's name), or
 * `undefined` when the file doesn't look like ts-server output. Tolerates doc
 * comments and every flag kind; anything else unexpected in `FlagKeys` makes
 * it unparseable.
 */
export function parseTsServerFlags(text: string): GeneratedFlag[] | undefined {
  const block = KEYS.exec(text);
  if (!block) return undefined;

  const kinds = new Map<string, FlagKind>();
  for (const [, name, method] of text.matchAll(METHOD)) kinds.set(name!, kindOfSdkMethod(method!)!);

  const body = block[1]!.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const flags: GeneratedFlag[] = [];
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (line === '') continue;
    const entry = ENTRY.exec(line);
    if (!entry) return undefined;
    const identifier = /^\w+$/.test(entry[1]!) ? entry[1]! : unquote(entry[1]!);
    const kind = kinds.get(identifier);
    if (!kind) return undefined;
    flags.push({ key: unquote(entry[2]!), identifier, kind });
  }
  return flags;
}
