/**
 * Reads ts-server output back into flags, for `check`'s summary
 * (`Emitter.summarizeChanges`). The old side is whatever is on disk, so this
 * parses text rather than trusting a Flag model.
 */

import { summarizeFlagChanges, type FlagKind, type GeneratedFlag } from '@launchtarqly/core';

const SDK_KINDS: Record<string, FlagKind> = { bool: 'boolean', string: 'string', number: 'number', json: 'json' };

// `name(...): Promise<...> {` followed by `return this.client.<kind>Variation(`.
// `Variation\s*\(` skips the `...VariationDetail(` methods. Signatures may wrap.
const METHOD = /(?:^|\n)[ \t]*(\w+)[ \t]*\([^{;]*?\{\s*return\s+this\.client\.(bool|string|number|json)Variation\s*\(/g;

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
  const block = /\nexport const FlagKeys = \{\n([\s\S]*?)\n\}(?: as const)?;/.exec(text);
  if (!block) return undefined;

  const kinds = new Map<string, FlagKind>();
  for (const [, name, sdkKind] of text.matchAll(METHOD)) kinds.set(name!, SDK_KINDS[sdkKind!]!);

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

/** `check`'s flag summary for a stale ts-server file; `undefined` if either side can't be parsed. */
export function summarizeTsServerChanges(oldText: string, newText: string): string | undefined {
  const oldFlags = parseTsServerFlags(oldText);
  const newFlags = parseTsServerFlags(newText);
  return oldFlags && newFlags ? summarizeFlagChanges(oldFlags, newFlags) : undefined;
}
