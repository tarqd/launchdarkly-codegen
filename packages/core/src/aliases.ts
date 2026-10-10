/**
 * Aliases from the `codegen.name` custom properties (DESIGN.md → Normalizer
 * rules → Custom properties).
 */

import { CodegenError } from './errors.js';
import type { Flag, TargetId } from './model.js';
import type { ApiFlag } from './snapshot.js';

export const TARGET_IDS: readonly TargetId[] = ['ts-server', 'ts-browser', 'go', 'java'];

const NAME_PROPERTY = 'codegen.name';

/**
 * The single value of a custom property that takes exactly one non-blank
 * value, or undefined when it is absent or an empty array.
 */
export function singlePropertyValue(item: ApiFlag, property: string): string | undefined {
  const values = item.customProperties?.[property]?.value ?? [];
  if (values.length === 0) return undefined;
  if (values.length > 1) {
    throw new CodegenError(
      `flag ${item.key}: custom property ${property} must have exactly one value, got ${values.length}`,
    );
  }
  const [value] = values as [string];
  if (value.trim() === '') {
    throw new CodegenError(`flag ${item.key}: custom property ${property} must not be blank`);
  }
  return value;
}

/** `codegen.name.<target>` per target, falling back to `codegen.name`. */
export function aliasesFor(item: ApiFlag): Flag['aliases'] {
  const fallback = singlePropertyValue(item, NAME_PROPERTY);
  const aliases: Flag['aliases'] = {};
  for (const target of TARGET_IDS) {
    const alias = singlePropertyValue(item, `${NAME_PROPERTY}.${target}`) ?? fallback;
    if (alias !== undefined) aliases[target] = alias;
  }
  return aliases;
}
