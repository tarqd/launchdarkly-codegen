/** Built-in emitters, discovered statically (DESIGN.md → Repository layout). */

import { CodegenError, type Emitter } from '@launchtarqly/core';
import { tsServerEmitter } from '@launchtarqly/emit-ts-server';

export const BUILT_IN_EMITTERS: readonly Emitter[] = [tsServerEmitter];

export function emitterFor(id: string): Emitter {
  const emitter = BUILT_IN_EMITTERS.find((e) => e.id === id);
  if (!emitter) {
    const known = BUILT_IN_EMITTERS.map((e) => e.id).join(', ');
    throw new CodegenError(`unsupported target \`${id}\` (supported: ${known})`);
  }
  return emitter;
}
