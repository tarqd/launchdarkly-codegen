/**
 * How each flag kind reads in Java (DESIGN.md → java → Shape): the type its
 * methods return and take as the fallback, the boxed type inside
 * `EvaluationDetail<…>`, and the SDK methods the two methods call. The
 * emitter writes from this table and `check` reads back against it.
 */

import type { Flag, GeneratedKind } from '@launchtarqly/core';

/** The kinds a flag is emitted as: a number flag is always `int` or `double`. */
export type JavaKindName = Exclude<GeneratedKind, 'number'>;

export interface JavaKind {
  /** The value method's return type and the fallback's type. */
  type: string;
  /** The type argument of the detail method's `EvaluationDetail`. */
  boxed: string;
  /** The SDK method the value method calls. */
  method: string;
  /** The SDK method the detail method calls. */
  detailMethod: string;
}

const kind = (type: string, boxed: string, method: string): JavaKind => ({
  type,
  boxed,
  method,
  detailMethod: `${method}Detail`,
});

export const JAVA_KINDS: Readonly<Record<JavaKindName, JavaKind>> = {
  boolean: kind('boolean', 'Boolean', 'boolVariation'),
  string: kind('String', 'String', 'stringVariation'),
  double: kind('double', 'Double', 'doubleVariation'),
  int: kind('int', 'Integer', 'intVariation'),
  json: kind('LDValue', 'LDValue', 'jsonValueVariation'),
};

/** The kind `flag` is emitted as: a number flag is `int` only when `codegen.number` says so. */
export function javaKind(flag: Flag): JavaKindName {
  if (flag.kind !== 'number') return flag.kind;
  return flag.numberType === 'int' ? 'int' : 'double';
}
