/**
 * The pieces of dotnet output that the emitter (`index.ts`) writes and the
 * read-back parser (`flag-changes.ts`) recognizes, kept in one place so the
 * two can't drift apart.
 */

import type { Flag, FlagKind } from '@launchtarqly/core';

export interface SdkMethod {
  /** The `ILdClient` method, without `Detail`. */
  method: string;
  /** The C# type of the flag's value. */
  type: string;
}

/** The SDK method prefix and C# type for each Flag kind; a number flag is a `double` unless `codegen.number: int`. */
const KIND_METHODS: Record<FlagKind, SdkMethod> = {
  boolean: { method: 'BoolVariation', type: 'bool' },
  string: { method: 'StringVariation', type: 'string' },
  number: { method: 'DoubleVariation', type: 'double' },
  json: { method: 'JsonVariation', type: 'LdValue' },
};
/** A number flag with `codegen.number: int` (ADR 0001). */
const INT_METHOD: SdkMethod = { method: 'IntVariation', type: 'int' };

export function sdkMethod(flag: Pick<Flag, 'kind' | 'numberType'>): SdkMethod {
  return flag.kind === 'number' && flag.numberType === 'int' ? INT_METHOD : KIND_METHODS[flag.kind];
}

/** Every kind a flag's main method can return, telling a number flag's `int` from `double`. */
const READ_KINDS: readonly Pick<Flag, 'kind' | 'numberType'>[] = [
  { kind: 'boolean' },
  { kind: 'string' },
  { kind: 'number', numberType: 'int' },
  { kind: 'number', numberType: 'double' },
  { kind: 'json' },
];

const KINDS_BY_METHOD: ReadonlyMap<string, Pick<Flag, 'kind' | 'numberType'>> = new Map(
  READ_KINDS.map((kind) => [sdkMethod(kind).method, kind]),
);

/** Every SDK method a flag's main method may call. */
export const SDK_METHODS: readonly string[] = [...KINDS_BY_METHOD.keys()];

/** The flag kind (and number type) whose main method calls the SDK `method`, or `undefined`. */
export function kindOfSdkMethod(method: string): Pick<Flag, 'kind' | 'numberType'> | undefined {
  return KINDS_BY_METHOD.get(method);
}

/** The `Flags` class's field holding the `ILdClient`; flag methods call through it. */
export const CLIENT_FIELD = '_client';

/** The class holding each flag's key as a constant named like the flag's method. */
export const FLAG_KEYS_CLASS = 'FlagKeys';

/** The declaration of the `FlagKeys` class, on the line before its `{`. */
export const FLAG_KEYS_DECLARATION = `public static class ${FLAG_KEYS_CLASS}`;

/** What starts each `FlagKeys` constant's declaration, before its name. */
export const KEY_CONSTANT_PREFIX = 'public const string';
