/**
 * The pieces of ts-server output that the emitter (`index.ts`) writes and the
 * read-back parser (`flag-changes.ts`) recognizes, kept in one place so the
 * two can't drift apart.
 */

import type { FlagKind } from '@launchtarqly/core';

/** The SDK method prefix and TypeScript type for each Flag kind. */
export const KIND_METHODS: Record<FlagKind, { method: string; type: string }> = {
  boolean: { method: 'boolVariation', type: 'boolean' },
  string: { method: 'stringVariation', type: 'string' },
  number: { method: 'numberVariation', type: 'number' },
  json: { method: 'jsonVariation', type: 'unknown' },
};

/** Every SDK method a flag's primary method may call. */
export const SDK_METHODS: readonly string[] = Object.values(KIND_METHODS).map(({ method }) => method);

const KINDS_BY_METHOD: ReadonlyMap<string, FlagKind> = new Map(
  Object.entries(KIND_METHODS).map(([kind, { method }]) => [method, kind as FlagKind]),
);

/** The flag kind whose primary method calls the SDK `method`, or `undefined`. */
export function kindOfSdkMethod(method: string): FlagKind | undefined {
  return KINDS_BY_METHOD.get(method);
}

/** The `Flags` class's private field holding the `LDClient`; flag methods call through it. */
export const CLIENT_FIELD = 'client';

/** The opening line of the `FlagKeys` object, which also marks a file as ts-server output. */
export const FLAG_KEYS_OPEN = 'export const FlagKeys = {';

/** What follows `FlagKeys`'s closing brace; the parser also accepts a file without it. */
export const AS_CONST = ' as const';

/** The closing line of the `FlagKeys` object. */
export const FLAG_KEYS_CLOSE = `}${AS_CONST};`;
