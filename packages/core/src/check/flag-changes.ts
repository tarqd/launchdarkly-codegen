/**
 * The one-line flag summary `check` prints for a stale file (DESIGN.md → CLI).
 * The old side is whatever is on disk, so each emitter reads its own output
 * back into `GeneratedFlag`s (`Emitter.readFlags`); this compares them.
 */

import type { Flag, FlagKind } from '../model.js';

/** A flag as read back from generated text. */
export interface GeneratedFlag {
  key: string;
  /** The identifier the target emitted for the flag. */
  identifier: string;
  kind: FlagKind;
  /**
   * For a number flag, whether the target emitted it as an int or a double;
   * left out by targets whose output doesn't tell them apart (ts-server).
   */
  numberType?: Flag['numberType'];
}

/** `number (int)` for a number flag whose number type the target read back, else the kind. */
function kindLabel(flag: GeneratedFlag): string {
  return flag.kind === 'number' && flag.numberType ? `number (${flag.numberType})` : flag.kind;
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
      const [oldKind, newKind] = [kindLabel(o), kindLabel(n)];
      if (oldKind !== newKind) changedKind.push(`${key}: ${oldKind} → ${newKind}`);
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

/**
 * `check`'s summary for a stale file: both sides read back with the target's
 * `readFlags`, then compared. `undefined` when either side can't be read
 * back; the diff then stands alone.
 */
export function summarizeReadBack(
  readFlags: (text: string) => readonly GeneratedFlag[] | undefined,
  oldText: string,
  newText: string,
): string | undefined {
  const oldFlags = readFlags(oldText);
  const newFlags = readFlags(newText);
  return oldFlags && newFlags ? summarizeFlagChanges(oldFlags, newFlags) : undefined;
}
