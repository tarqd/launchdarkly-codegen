/**
 * The pieces of go output that the emitter (`index.ts`) writes and the
 * read-back parser (`flag-changes.ts`) recognizes, kept in one place so the
 * two can't drift apart.
 */

import type { Flag, FlagKind } from '@launchtarqly/core';

/** A flag kind as go tells kinds apart: number flags split into `int` and `double` (ADR 0001). */
export type GoKind = Exclude<FlagKind, 'number'> | 'int' | 'double';

/** An SDK evaluation method family and the Go type it takes and returns. */
export interface KindMethod {
  method: string;
  type: string;
}

/**
 * The SDK method family for each kind, in the order the `Client` interface
 * lists them. The interface always lists all five, so a project's first flag
 * of a kind never changes it.
 */
export const KIND_METHODS: Record<GoKind, KindMethod> = {
  boolean: { method: 'BoolVariation', type: 'bool' },
  string: { method: 'StringVariation', type: 'string' },
  double: { method: 'Float64Variation', type: 'float64' },
  int: { method: 'IntVariation', type: 'int' },
  json: { method: 'JSONVariation', type: 'ldvalue.Value' },
};

/** A flag's go kind. Number flags are `double` unless `codegen.number: int` (ADR 0001). */
export function goKind(flag: Pick<Flag, 'kind' | 'numberType'>): GoKind {
  return flag.kind === 'number' ? (flag.numberType ?? 'double') : flag.kind;
}

const KINDS_BY_TYPE: ReadonlyMap<string, GoKind> = new Map(
  Object.entries(KIND_METHODS).map(([kind, { type }]) => [type, kind as GoKind]),
);

/** The flag kind (and number type) whose methods take and return the Go `type`, or `undefined`. */
export function kindOfGoType(type: string): Pick<Flag, 'kind' | 'numberType'> | undefined {
  const kind = KINDS_BY_TYPE.get(type);
  if (kind === undefined) return undefined;
  return kind === 'int' || kind === 'double' ? { kind: 'number', numberType: kind } : { kind };
}

/**
 * The four method forms each flag gets, in output order. A form's suffix is
 * both the flag method's suffix and the SDK method's (`BoolVariation` +
 * `DetailCtx`). `variantSummary` is the variant's one-line doc; the primary
 * form has the flag's full doc instead.
 */
export const METHOD_FORMS: readonly {
  suffix: string;
  detail: boolean;
  ctx: boolean;
  variantSummary?: (name: string) => string;
}[] = [
  { suffix: '', detail: false, ctx: false },
  { suffix: 'Detail', detail: true, ctx: false, variantSummary: (n) => `${n}Detail is ${n} with the evaluation reason.` },
  { suffix: 'Ctx', detail: false, ctx: true, variantSummary: (n) => `${n}Ctx is ${n} with a Go context for SDK hooks.` },
  {
    suffix: 'DetailCtx',
    detail: true,
    ctx: true,
    variantSummary: (n) => `${n}DetailCtx is ${n}Detail with a Go context for SDK hooks.`,
  },
];

/** The `Key…` constant holding a flag's key, for a flag named `name`. */
export function keyConstant(name: string): string {
  return `Key${name}`;
}

/** The `Flags` struct declaration, which also marks a file as go output. */
export const FLAGS_STRUCT = 'type Flags struct{ client Client }';

/** The comment above the `Key…` constant group. */
export const KEYS_COMMENT = '// Flag keys, for code that needs the raw key.';
