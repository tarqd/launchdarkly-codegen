/**
 * Flag naming shared by every emitter (DESIGN.md → Naming). A target declares
 * its rules; nameFlags names every flag by its alias or converted key and
 * checks every name the target will emit for it: leading digits, syntax and
 * reserved words, then collisions across the whole file. The generator never
 * invents a name, so every failure tells the user to set an alias.
 */

import { CodegenError } from './errors.js';
import type { Flag, FlagModel, TargetId } from './model.js';

export interface NamingRules {
  target: TargetId;
  /** Turns a flag key into the target's casing, for flags with no alias. */
  convert: (key: string) => string;
  /** Words the target's language reserves. */
  reserved: ReadonlySet<string>;
  /** What a valid identifier looks like in the target's language. */
  pattern: RegExp;
  /** Why a name that fails `pattern` is rejected; defaults to "is not a valid identifier". */
  invalidReason?: string;
  /** Names the emitter itself declares, which no flag may take. */
  ownNames: readonly string[];
  /** The other names the target emits for a flag, built from its flag name (a `Detail` method, a key constant). */
  derived?: (name: string) => readonly string[];
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

function aliasHint(target: TargetId): string {
  return `add the value ${target}:<name> to the custom property codegen.name`;
}

/**
 * Each flag's flag name: its alias for the target, or its converted key.
 * Throws a CodegenError (exit 2) on the first invalid or colliding name.
 */
export function nameFlags(model: FlagModel, rules: NamingRules): Map<Flag, string> {
  const { target } = rules;
  const fail = (flagKey: string, identifier: string, problem: string): never => {
    throw new CodegenError(
      `flag ${flagKey}: ${target} identifier "${identifier}" ${problem}; ${aliasHint(target)} to choose a name`,
    );
  };

  const names = new Map<Flag, string>();
  const emitted: { flagKey: string; identifiers: readonly string[] }[] = [];
  for (const flag of model.flags) {
    const name = flag.aliases[target] ?? rules.convert(flag.key);
    const identifiers = [name, ...(rules.derived?.(name) ?? [])];
    for (const identifier of identifiers) {
      if (/^[0-9]/.test(identifier)) fail(flag.key, identifier, 'starts with a digit');
      if (!rules.pattern.test(identifier)) fail(flag.key, identifier, rules.invalidReason ?? 'is not a valid identifier');
      if (rules.reserved.has(identifier)) fail(flag.key, identifier, 'is a reserved word');
    }
    names.set(flag, name);
    emitted.push({ flagKey: flag.key, identifiers });
  }

  const own = new Set(rules.ownNames);
  const owners = new Map<string, string>();
  for (const { flagKey, identifiers } of emitted) {
    for (const identifier of identifiers) {
      if (own.has(identifier)) fail(flagKey, identifier, 'collides with a name the generator uses');
      const owner = owners.get(identifier);
      if (owner === undefined) {
        owners.set(identifier, flagKey);
      } else if (owner !== flagKey) {
        const [a, b] = [owner, flagKey].sort();
        throw new CodegenError(
          `${target} identifier "${identifier}" is produced by flags ${a} and ${b}; ${aliasHint(target)} on one of them`,
        );
      }
    }
  }
  return names;
}
