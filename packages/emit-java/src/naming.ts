/**
 * Java names for each flag (DESIGN.md → Naming, java row): the method in
 * lowerCamel and the `Keys` constant in CONSTANT_CASE, both from the flag's
 * java alias when it has one.
 */

import { constantCase, flagIdentifier, lowerCamel, type Flag, type FlagModel, type TargetId } from '@launchtarqly/core';

const JAVA: TargetId = 'java';

/**
 * Words that can't be a Java identifier: the 51 JLS 21 §3.9 reserved
 * keywords (including `_`) plus the literals `true`, `false` and `null`.
 */
export const JAVA_RESERVED_WORDS: ReadonlySet<string> = new Set([
  'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const',
  'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'final', 'finally', 'float',
  'for', 'goto', 'if', 'implements', 'import', 'instanceof', 'int', 'interface', 'long', 'native',
  'new', 'package', 'private', 'protected', 'public', 'return', 'short', 'static', 'strictfp',
  'super', 'switch', 'synchronized', 'this', 'throw', 'throws', 'transient', 'try', 'void',
  'volatile', 'while', '_',
  // Literals.
  'true', 'false', 'null',
]);

export interface JavaFlagNames {
  /** The value method; the detail method is this plus `Detail`. */
  method: string;
  /** The `Keys` constant holding the flag key. */
  constant: string;
}

/** Each flag's Java names. */
export function flagNames(model: FlagModel): Map<Flag, JavaFlagNames> {
  return new Map(
    model.flags.map((flag) => {
      const method = flagIdentifier(flag, JAVA, lowerCamel);
      return [flag, { method, constant: constantCase(method) }];
    }),
  );
}
