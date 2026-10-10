/**
 * Reads go output back into flags, for `check`'s summary
 * (`Emitter.summarizeChanges`). The old side is whatever is on disk, so this
 * parses text rather than trusting a Flag model.
 */

import { summarizeFlagChanges, type GeneratedFlag } from '@launchtarqly/core';
import { FLAGS_STRUCT, keyConstant, KEYS_COMMENT, kindOfGoType } from './output.js';

const IDENT = String.raw`[\p{L}\p{Nd}_]+`;

// Only the primary form takes `(context, fallback)` and returns `(T, error)`;
// the Detail and Ctx variants differ in parameters or results.
const METHOD = new RegExp(
  String.raw`^func \(f \*Flags\) (${IDENT})\(context ldcontext\.Context, fallback ([\w.]+)\) \(\2, error\) \{$`,
  'gmu',
);

/** `text` matched literally inside a RegExp. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const KEYS = new RegExp(String.raw`\n${escapeRegExp(KEYS_COMMENT)}\nconst \(\n([\s\S]*?)\n\)\n`);
const CONSTANT = new RegExp(String.raw`^${escapeRegExp(keyConstant(''))}(${IDENT}) *= ("(?:[^"\\\n]|\\.)*")$`, 'u');

/** A Go interpreted string literal as the emitter writes it (JSON-compatible escapes), or `undefined`. */
function unquote(literal: string): string | undefined {
  try {
    return JSON.parse(literal) as string;
  } catch {
    return undefined;
  }
}

/**
 * The flags in a go file, in `Key…` constant order (the identifier is the
 * constant without `Key`, which is also the primary method's name), or
 * `undefined` when the file doesn't look like go output. The kind, and a
 * number flag's number type, come from the primary method's signature.
 * Tolerates `// Deprecated:` lines in the constant group; anything else
 * unexpected there makes it unparseable.
 */
export function parseGoFlags(text: string): GeneratedFlag[] | undefined {
  if (!text.includes(`\n${FLAGS_STRUCT}\n`)) return undefined;

  const kinds = new Map<string, Pick<GeneratedFlag, 'kind' | 'numberType'>>();
  for (const [, name, type] of text.matchAll(METHOD)) {
    const kind = kindOfGoType(type!);
    if (!kind) return undefined;
    kinds.set(name!, kind);
  }

  const block = KEYS.exec(text);
  // A project with no flags has no constant group, and no methods.
  if (!block) return kinds.size === 0 ? [] : undefined;

  const flags: GeneratedFlag[] = [];
  for (const raw of block[1]!.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('//')) continue;
    const constant = CONSTANT.exec(line);
    if (!constant) return undefined;
    const identifier = constant[1]!;
    const key = unquote(constant[2]!);
    const kind = kinds.get(identifier);
    if (key === undefined || !kind) return undefined;
    flags.push({ key, identifier, ...kind });
  }
  return flags;
}

/** `check`'s flag summary for a stale go file; `undefined` if either side can't be parsed. */
export function summarizeGoChanges(oldText: string, newText: string): string | undefined {
  const oldFlags = parseGoFlags(oldText);
  const newFlags = parseGoFlags(newText);
  return oldFlags && newFlags ? summarizeFlagChanges(oldFlags, newFlags) : undefined;
}
