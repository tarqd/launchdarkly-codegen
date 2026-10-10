/**
 * Reads java output back into flags, for `check`'s summary
 * (`Emitter.readFlags`). The old side is whatever is on disk, so this
 * parses text rather than trusting a Flag model.
 *
 * Comments are dropped and whitespace is squeezed out of the code first, so
 * every line break google-java-format makes (layout.ts) reads the same as the
 * one-line form.
 */

import type { GeneratedFlag } from '@launchtarqly/core';
import { generatedKind, JAVA_KINDS, type JavaKind, type JavaKindName } from './kinds.js';
import {
  CLIENT_FIELD,
  CONTEXT_PARAM,
  CONTEXT_TYPE,
  DEPRECATED,
  FALLBACK_PARAM,
  KEY_CONSTANT_HEAD,
  KEYS_CLASS,
  KEYS_CONSTRUCTOR,
  KEYS_DECLARATION,
} from './output.js';

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

/** Code from `output.ts`, squeezed as the file is, matched literally inside a RegExp. */
function code(text: string): string {
  return squeeze(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const KEYS = new RegExp(String.raw`${code(KEYS_DECLARATION)}\{${code(KEYS_CONSTRUCTOR)}(.*)\}\}$`, 's');
const CONSTANT = new RegExp(String.raw`(?:${code(DEPRECATED)} )?${code(KEY_CONSTANT_HEAD)} (${IDENT})=(${STRING});`, 'y');
const [CONTEXT, FALLBACK] = [code(CONTEXT_PARAM), code(FALLBACK_PARAM)];
const METHOD = new RegExp(
  String.raw`public (\w+) (${IDENT})\(${code(CONTEXT_TYPE)} ${CONTEXT},\1 ${FALLBACK}\)\{` +
    String.raw`return ${code(CLIENT_FIELD)}\.(\w+)\(${code(KEYS_CLASS)}\.(${IDENT}),${CONTEXT},${FALLBACK}\);\}`,
  'g',
);

function unquote(literal: string): string {
  return literal.slice(1, -1).replace(/\\(.)/g, '$1');
}

/**
 * The flags in a java `Flags.java`, in `Keys` order: the key is a `Keys`
 * constant's value, and the identifier and kind are the name and return type
 * of the primary method whose body reads that constant (`Keys.X`), so `int`
 * and `double` differ. The method name, not the constant, is the identifier:
 * aliases such as `apiUrlId` and `apiURLId` share the constant `API_URL_ID`.
 * `undefined` when the file doesn't look like java output: no `Keys` class,
 * anything but constants in it, or a constant no primary method reads.
 */
export function parseJavaFlags(text: string): GeneratedFlag[] | undefined {
  const code = squeeze(text);
  const keys = KEYS.exec(code);
  if (!keys) return undefined;

  const readers = new Map<string, Omit<GeneratedFlag, 'key'>>();
  for (const [, type, identifier, call, constant] of code.matchAll(METHOD)) {
    const java = BY_TYPE.get(type!);
    if (java !== undefined && java.method === call) readers.set(constant!, { identifier: identifier!, ...generatedKind(java.kind) });
  }

  const body = keys[1]!;
  const flags: GeneratedFlag[] = [];
  for (let at = 0; at < body.length; at = CONSTANT.lastIndex) {
    CONSTANT.lastIndex = at;
    const entry = CONSTANT.exec(body);
    if (!entry) return undefined;
    const reader = readers.get(entry[1]!);
    if (!reader) return undefined;
    flags.push({ key: unquote(entry[2]!), ...reader });
  }
  return flags;
}
