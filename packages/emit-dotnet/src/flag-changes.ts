/**
 * Reads dotnet output back into flags, for `check`'s summary
 * (`Emitter.summarizeChanges`). The old side is whatever is on disk, so this
 * parses text rather than trusting a Flag model.
 */

import { summarizeFlagChanges, type GeneratedFlag } from '@launchtarqly/core';
import { IDENTIFIER as ID } from './identifier.js';

const SDK_KINDS: Record<string, Pick<GeneratedFlag, 'kind' | 'numberType'>> = {
  Bool: { kind: 'boolean' },
  String: { kind: 'string' },
  Int: { kind: 'number', numberType: 'int' },
  Double: { kind: 'number', numberType: 'double' },
  Json: { kind: 'json' },
};

const STRING = String.raw`"(?:[^"\\\n]|\\.)*"`;

// `return _client.<Kind>Variation(FlagKeys.<Name>, ...`. `Variation\s*\(` skips the `...VariationDetail(` methods.
const CALL = new RegExp(String.raw`_client\.(Bool|String|Int|Double|Json)Variation\s*\(\s*FlagKeys\.(${ID})\s*,`, 'gu');
const CONSTANT = new RegExp(String.raw`^public\s+const\s+string\s+(${ID})\s*=\s*(${STRING})\s*;$`, 'u');
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
  const block = /\n[ \t]*public\s+static\s+class\s+FlagKeys\s*\{\r?\n([\s\S]*?)\r?\n[ \t]*\}/.exec(text);
  if (!block) return undefined;

  const kinds = new Map<string, Pick<GeneratedFlag, 'kind' | 'numberType'>>();
  for (const [, sdkKind, name] of text.matchAll(CALL)) kinds.set(name!, SDK_KINDS[sdkKind!]!);

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

/** `check`'s flag summary for a stale dotnet file; `undefined` if either side can't be parsed. */
export function summarizeDotnetChanges(oldText: string, newText: string): string | undefined {
  const oldFlags = parseDotnetFlags(oldText);
  const newFlags = parseDotnetFlags(newText);
  return oldFlags && newFlags ? summarizeFlagChanges(oldFlags, newFlags) : undefined;
}
