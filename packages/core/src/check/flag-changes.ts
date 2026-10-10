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
  /**
   * Number flags only, when the target's output tells `int` from `double`
   * (go does, ts-server doesn't). Compared only when both sides have it.
   */
  numberType?: 'int' | 'double';
}

/** `json`, or `number (int)` when the number type is known. */
function kindLabel(flag: GeneratedFlag): string {
  return flag.numberType === undefined ? flag.kind : `${flag.kind} (${flag.numberType})`;
}

function kindChanged(o: GeneratedFlag, n: GeneratedFlag): boolean {
  if (o.kind !== n.kind) return true;
  return o.numberType !== undefined && n.numberType !== undefined && o.numberType !== n.numberType;
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
      if (kindChanged(o, n)) changedKind.push(`${key}: ${kindLabel(o)} → ${kindLabel(n)}`);
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
