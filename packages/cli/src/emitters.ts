/** Built-in emitters, discovered statically (DESIGN.md → Repository layout). */

import type { Emitter } from '@launchtarqly/core';
import { tsServerEmitter } from '@launchtarqly/emit-ts-server';

export const BUILT_IN_EMITTERS: readonly Emitter[] = [tsServerEmitter];

/**
 * The emitter for a target id. Config loading has already rejected unknown
 * ids (and unsupported `sdkMajor`s), so a miss here is a bug, not exit 2.
 */
export function emitterFor(id: string): Emitter {
  const emitter = BUILT_IN_EMITTERS.find((e) => e.id === id);
  if (!emitter) throw new Error(`no built-in emitter for target \`${id}\`; config validation should have rejected it`);
  return emitter;
}
