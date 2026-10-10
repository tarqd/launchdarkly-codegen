/**
 * Custom properties read by the normalizer (DESIGN.md → Normalizer rules →
 * Custom properties).
 */

import { CodegenError } from './errors.js';
import type { ApiFlag } from './snapshot.js';

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
