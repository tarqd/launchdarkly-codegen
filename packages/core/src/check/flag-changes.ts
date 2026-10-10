/**
 * The one-line flag summary `check` prints for a stale ts-server file
 * (DESIGN.md → CLI). The old side is whatever is on disk, so both sides are
 * read back from generated text rather than from a Flag model.
 */

import type { FlagKind } from '../model.js';

export interface GeneratedFlag {
  key: string;
  /** The `FlagKeys` property, which is also the evaluation method's name. */
  identifier: string;
  kind: FlagKind;
}

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
 * The flags in a ts-server file, in `FlagKeys` order, or `undefined` when the
 * file doesn't look like ts-server output. Tolerates doc comments and every
 * flag kind; anything else unexpected in `FlagKeys` makes it unparseable.
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

function part(count: number, label: string, items: string[]): string | undefined {
  return count === 0 ? undefined : `${count} ${label} (${items.join(', ')})`;
}

/**
 * E.g. `flags: 1 added (a), 1 renamed (b: bOld → bNew)`, comparing the
 * file on disk with the new output; `undefined` if either can't be parsed.
 */
export function summarizeFlagChanges(oldText: string, newText: string): string | undefined {
  const oldFlags = parseTsServerFlags(oldText);
  const newFlags = parseTsServerFlags(newText);
  if (!oldFlags || !newFlags) return undefined;

  const byKey = (flags: GeneratedFlag[]) => new Map(flags.map((f) => [f.key, f]));
  const before = byKey(oldFlags);
  const after = byKey(newFlags);
  const keys = [...new Set([...before.keys(), ...after.keys()])].sort();

  const added: string[] = [];
  const removed: string[] = [];
  const renamed: string[] = [];
  const changedKind: string[] = [];
  for (const key of keys) {
    const o = before.get(key);
    const n = after.get(key);
    if (!o) added.push(key);
    else if (!n) removed.push(key);
    else {
      if (o.identifier !== n.identifier) renamed.push(`${key}: ${o.identifier} → ${n.identifier}`);
      if (o.kind !== n.kind) changedKind.push(`${key}: ${o.kind} → ${n.kind}`);
    }
  }

  const parts = [
    part(added.length, 'added', added),
    part(removed.length, 'removed', removed),
    part(renamed.length, 'renamed', renamed),
    part(changedKind.length, 'changed kind', changedKind),
  ].filter((p) => p !== undefined);
  return `flags: ${parts.length === 0 ? 'no changes' : parts.join(', ')}`;
}
