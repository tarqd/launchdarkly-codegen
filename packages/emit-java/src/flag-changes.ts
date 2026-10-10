/**
 * Reads java output back into flags, for `check`'s summary
 * (`Emitter.summarizeChanges`). The old side is whatever is on disk, so this
 * parses text rather than trusting a Flag model.
 *
 * Comments are dropped and whitespace is squeezed out of the code first, so
 * every line break google-java-format makes (layout.ts) reads the same as the
 * one-line form.
 */

import { summarizeFlagChanges, type GeneratedFlag } from '@launchtarqly/core';
import { JAVA_KINDS, type JavaKind, type JavaKindName } from './kinds.js';

/** Each primary method's return type, and the kind it is. */
const BY_TYPE = new Map(
  (Object.entries(JAVA_KINDS) as [JavaKindName, JavaKind][]).map(([kind, java]) => [java.type, { kind, ...java }]),
);

const IDENT = String.raw`[A-Za-z_$][\w$]*`;
const STRING = String.raw`"(?:[^"\\\n]|\\.)*"`;

/** A string or char literal, a comment, a whitespace run or any other character. */
const TOKEN = new RegExp(String.raw`${STRING}|'(?:[^'\\\n]|\\.)*'|/\*[\s\S]*?\*/|//[^\n]*|\s+|.`, 'g');

/**
 * `text` without comments, keeping whitespace only where it separates two
 * words (`public static`, never `Keys .NAME` or `x =`). Literals are kept
 * as written.
 */
function squeeze(text: string): string {
  let out = '';
  let pendingSpace = false;
  for (const [token] of text.matchAll(TOKEN)) {
    if (token.startsWith('/*') || token.startsWith('//') || /^\s/.test(token)) {
      pendingSpace = true;
      continue;
    }
    if (pendingSpace && /[\w$]$/.test(out) && /^[\w$]/.test(token)) out += ' ';
    pendingSpace = false;
    out += token;
  }
  return out;
}

const KEYS = /public static final class Keys\{private Keys\(\)\{\}(.*)\}\}$/s;
const CONSTANT = new RegExp(String.raw`(?:@Deprecated )?public static final String (${IDENT})=(${STRING});`, 'y');
const METHOD = new RegExp(
  String.raw`public (\w+) (${IDENT})\(LDContext context,\1 fallback\)\{return client\.(\w+)\(Keys\.(${IDENT}),context,fallback\);\}`,
  'g',
);

function unquote(literal: string): string {
  return literal.slice(1, -1).replace(/\\(.)/g, '$1');
}

/**
 * The flags in a java `Flags.java`, in `Keys` order: the identifier is the
 * `Keys` constant, the key its value, and the kind the return type of the
 * primary method that reads the constant (so `int` and `double` differ).
 * `undefined` when the file doesn't look like java output: no `Keys` class,
 * anything but constants in it, or a constant no primary method reads.
 */
export function parseJavaFlags(text: string): GeneratedFlag[] | undefined {
  const code = squeeze(text);
  const keys = KEYS.exec(code);
  if (!keys) return undefined;

  const kinds = new Map<string, JavaKindName>();
  for (const [, type, , call, constant] of code.matchAll(METHOD)) {
    const java = BY_TYPE.get(type!);
    if (java !== undefined && java.method === call) kinds.set(constant!, java.kind);
  }

  const body = keys[1]!;
  const flags: GeneratedFlag[] = [];
  for (let at = 0; at < body.length; at = CONSTANT.lastIndex) {
    CONSTANT.lastIndex = at;
    const entry = CONSTANT.exec(body);
    if (!entry) return undefined;
    const kind = kinds.get(entry[1]!);
    if (!kind) return undefined;
    flags.push({ key: unquote(entry[2]!), identifier: entry[1]!, kind });
  }
  return flags;
}

/** `check`'s flag summary for a stale java file; `undefined` if either side can't be parsed. */
export function summarizeJavaChanges(oldText: string, newText: string): string | undefined {
  const oldFlags = parseJavaFlags(oldText);
  const newFlags = parseJavaFlags(newText);
  return oldFlags && newFlags ? summarizeFlagChanges(oldFlags, newFlags) : undefined;
}
