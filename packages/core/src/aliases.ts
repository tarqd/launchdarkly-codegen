/**
 * Aliases from the `codegen.name` custom property (DESIGN.md → Normalizer
 * rules → Custom properties).
 */

import { CodegenError } from './errors.js';
import type { Flag, TargetId } from './model.js';
import type { ApiFlag } from './snapshot.js';

export const TARGET_IDS: readonly TargetId[] = ['ts-server', 'ts-browser', 'go', 'java', 'dotnet'];

export const NAME_PROPERTY = 'codegen.name';

/**
 * Each `codegen.name` value is `<target>:<name>` for one target, or a bare
 * `<name>` for every target without a target-specific value. Aliases contain
 * no `:`, so the first one separates the target.
 */
export function aliasesFor(item: ApiFlag): Flag['aliases'] {
  rejectPerTargetProperties(item);
  const fail = (problem: string): never => {
    throw new CodegenError(`flag ${item.key}: custom property ${NAME_PROPERTY} ${problem}`);
  };
  let fallback: string | undefined;
  const perTarget: Flag['aliases'] = {};
  for (const value of item.customProperties?.[NAME_PROPERTY]?.value ?? []) {
    const colon = value.indexOf(':');
    const name = colon === -1 ? value : value.slice(colon + 1);
    if (name.trim() === '') fail(`value "${value}" must not have a blank name`);
    if (colon === -1) {
      if (fallback !== undefined) fail(`has more than one value without a target ("${fallback}" and "${value}")`);
      fallback = name;
      continue;
    }
    const target = value.slice(0, colon) as TargetId;
    if (!TARGET_IDS.includes(target)) {
      fail(`value "${value}" names unknown target "${target}" (known targets: ${TARGET_IDS.join(', ')})`);
    }
    if (perTarget[target] !== undefined) fail(`has more than one value for ${target}`);
    perTarget[target] = name;
  }
  const aliases: Flag['aliases'] = {};
  for (const target of TARGET_IDS) {
    const alias = perTarget[target] ?? fallback;
    if (alias !== undefined) aliases[target] = alias;
  }
  return aliases;
}

/** The old `codegen.name.<target>` keys are no longer read; say how to move them rather than ignore them. */
function rejectPerTargetProperties(item: ApiFlag): void {
  const prefix = `${NAME_PROPERTY}.`;
  const old = Object.keys(item.customProperties ?? {}).find((key) => key.startsWith(prefix));
  if (old === undefined) return;
  throw new CodegenError(
    `flag ${item.key}: custom property ${old} is not supported; ` +
      `add the value ${old.slice(prefix.length)}:<name> to ${NAME_PROPERTY} instead`,
  );
}
