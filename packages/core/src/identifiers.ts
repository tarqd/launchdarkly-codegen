/**
 * Identifier validation shared by every emitter (DESIGN.md → Naming). An
 * emitter lists every identifier it will emit; this checks leading digits,
 * syntax and reserved words on each flag's own name, and collisions across
 * the whole list. The generator never invents a name, so every failure tells
 * the user to set an alias.
 */

import { CodegenError } from './errors.js';
import type { Flag, TargetId } from './model.js';

export interface IdentifierRules {
  target: TargetId;
  /** Words the target's language reserves. */
  reserved: ReadonlySet<string>;
  /** What a valid identifier looks like in the target's language. */
  pattern: RegExp;
  /** Why a name that fails `pattern` is rejected; defaults to "is not a valid identifier". */
  invalidReason?: string;
}

export interface EmittedIdentifier {
  identifier: string;
  /** The flag the identifier belongs to; absent for names the emitter itself uses. */
  flagKey?: string;
  /**
   * The flag's own name (converted key or alias), as opposed to a name
   * derived from it such as a `Detail` variant. Only this one is checked for
   * leading digits, syntax and reserved words.
   */
  primary?: boolean;
}

/** ECMAScript reserved words plus strict-mode (and module) reserved words. */
export const ECMASCRIPT_RESERVED_WORDS: ReadonlySet<string> = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do',
  'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'import', 'in',
  'instanceof', 'new', 'null', 'return', 'super', 'switch', 'this', 'throw', 'true', 'try',
  'typeof', 'var', 'void', 'while', 'with',
  // Strict mode and modules.
  'await', 'implements', 'interface', 'let', 'package', 'private', 'protected', 'public', 'static',
  'yield',
]);

/** The flag's name for a target: its alias, or the converted key. */
export function flagIdentifier(flag: Flag, target: TargetId, convert: (key: string) => string): string {
  return flag.aliases[target] ?? convert(flag.key);
}

function aliasHint(target: TargetId): string {
  return `set the custom property codegen.name.${target}`;
}

/** Throws a CodegenError (exit 2) on the first invalid or colliding identifier. */
export function checkIdentifiers(rules: IdentifierRules, identifiers: readonly EmittedIdentifier[]): void {
  const { target } = rules;
  const fail = (flagKey: string, identifier: string, problem: string): never => {
    throw new CodegenError(
      `flag ${flagKey}: ${target} identifier "${identifier}" ${problem}; ${aliasHint(target)} to choose a name`,
    );
  };

  for (const { identifier, flagKey, primary } of identifiers) {
    if (!primary || flagKey === undefined) continue;
    if (/^[0-9]/.test(identifier)) fail(flagKey, identifier, 'starts with a digit');
    if (!rules.pattern.test(identifier)) fail(flagKey, identifier, rules.invalidReason ?? 'is not a valid identifier');
    if (rules.reserved.has(identifier)) fail(flagKey, identifier, 'is a reserved word');
  }

  const owners = new Map<string, string | undefined>();
  for (const { identifier, flagKey } of identifiers) {
    if (!owners.has(identifier)) {
      owners.set(identifier, flagKey);
      continue;
    }
    const owner = owners.get(identifier);
    if (owner === flagKey) continue;
    if (owner === undefined || flagKey === undefined) {
      fail((owner ?? flagKey)!, identifier, 'collides with a name the generator uses');
    }
    const [a, b] = [owner!, flagKey!].sort();
    throw new CodegenError(
      `${target} identifier "${identifier}" is produced by flags ${a} and ${b}; ${aliasHint(target)} on one of them`,
    );
  }
}
