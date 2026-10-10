/**
 * The one-line flag summary `check` prints for a stale file (DESIGN.md → CLI).
 * The old side is whatever is on disk, so each emitter reads its own output
 * back into `GeneratedFlag`s (`Emitter.summarizeChanges`); this compares them.
 */

import type { FlagKind } from '../model.js';

/** A flag as read back from generated text. */
export interface GeneratedFlag {
  key: string;
  /** The identifier the target emitted for the flag. */
  identifier: string;
  kind: FlagKind;
}

function part(count: number, label: string, items: string[]): string | undefined {
  return count === 0 ? undefined : `${count} ${label} (${items.join(', ')})`;
}

/**
 * E.g. `flags: 1 added (a), 1 renamed (b: bOld → bNew)`, comparing the flags
 * in the file on disk with those in the new output.
 */
export function summarizeFlagChanges(oldFlags: readonly GeneratedFlag[], newFlags: readonly GeneratedFlag[]): string {
  const byKey = (flags: readonly GeneratedFlag[]) => new Map(flags.map((f) => [f.key, f]));
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
