/**
 * Aliases from the `codegen.name` custom properties (DESIGN.md → Normalizer
 * rules → Custom properties).
 */

import type { Flag, TargetId } from './model.js';
import { singlePropertyValue } from './properties.js';
import type { ApiFlag } from './snapshot.js';

export const TARGET_IDS: readonly TargetId[] = ['ts-server', 'ts-browser', 'go', 'java'];

const NAME_PROPERTY = 'codegen.name';

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
