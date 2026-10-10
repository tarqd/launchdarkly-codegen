/**
 * Java names for each flag (DESIGN.md → Naming, java row): the method in
 * lowerCamel and the `Keys` constant in CONSTANT_CASE, both from the flag's
 * java alias when it has one. Core checks every name the file emits before
 * it is used.
 */

import {
  constantCase,
  lowerCamel,
  nameFlags,
  type Flag,
  type FlagModel,
  type NamingRules,
  type TargetId,
} from '@launchtarqly/core';
import { CLIENT_FIELD, KEYS_CLASS } from './output.js';

/** This target's id, as configs and `codegen.name.<target>` properties spell it. */
export const JAVA: TargetId = 'java';

/** A Java identifier, ASCII only so the generated file reads the same in every encoding. */
export const JAVA_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

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

/**
 * Names a flag may not take beyond JAVA_RESERVED_WORDS
 * (docs/research/java-server-sdk.md §9): `yield`, which can be declared but
 * never called unqualified, and the `Object` methods a flag method would
 * override or overload.
 */
const JAVA_UNUSABLE_NAMES = [
  'yield',
  'wait', 'notify', 'notifyAll', 'equals', 'hashCode', 'toString', 'getClass', 'clone', 'finalize',
];

const NAMING: NamingRules = {
  target: JAVA,
  convert: lowerCamel,
  reserved: new Set([...JAVA_RESERVED_WORDS, ...JAVA_UNUSABLE_NAMES]),
  pattern: JAVA_IDENTIFIER,
  // The class, its nested class and its field.
  ownNames: ['Flags', KEYS_CLASS, CLIENT_FIELD],
  // The constant is checked like the method: an alias such as `_1x` or `$`
  // converts to a constant that isn't an identifier.
  derived: (method) => [`${method}Detail`, constantCase(method)],
};

export interface JavaFlagNames {
  /** The value method; the detail method is this plus `Detail`. */
  method: string;
  /** The `Keys` constant holding the flag key. */
  constant: string;
}

/**
 * Each flag's Java names, after checking every identifier the file emits.
 * Throws a CodegenError (exit 2) naming the flag and `codegen.name.java`.
 */
export function flagNames(model: FlagModel): Map<Flag, JavaFlagNames> {
  return new Map(
    [...nameFlags(model, NAMING)].map(([flag, method]): [Flag, JavaFlagNames] => [
      flag,
      { method, constant: constantCase(method) },
    ]),
  );
}
