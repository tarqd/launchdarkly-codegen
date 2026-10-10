/**
 * Snapshot → Flag model (DESIGN.md → Normalizer rules). Runs the same way on
 * a live fetch and on a replayed snapshot.
 */

import { aliasesFor } from './aliases.js';
import { CodegenError } from './errors.js';
import type { Flag, FlagKind, FlagModel, Maintainer } from './model.js';
import { singlePropertyValue } from './properties.js';
import type { ApiFlag, Snapshot } from './snapshot.js';

export interface NormalizeOptions {
  /** Receives non-fatal problems (for example mixed variation types). */
  warn?: (message: string) => void;
}

export function normalize(snapshot: Snapshot, options: NormalizeOptions = {}): FlagModel {
  const warn = options.warn ?? (() => {});
  const flags = snapshot.flagPages
    .flatMap((page) => page.items)
    .filter((item) => !item.archived)
    .map((item) => normalizeFlag(item, snapshot, warn))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return { projectKey: snapshot.projectKey, flags };
}

function normalizeFlag(item: ApiFlag, snapshot: Snapshot, warn: (message: string) => void): Flag {
  const kind = inferKind(item, warn);
  return {
    key: item.key,
    name: item.name,
    description: item.description ?? '',
    kind,
    ...(kind === 'number' && { numberType: numberType(item) }),
    clientSideAvailability: item.clientSideAvailability ?? {
      usingEnvironmentId: item.includeInSnippet ?? false,
      usingMobileKey: true,
    },
    tags: item.tags,
    ...maintainerOf(item),
    ...deprecationOf(item),
    archived: item.archived,
    aliases: aliasesFor(item),
    uiUrl: `${snapshot.baseUri}/projects/${snapshot.projectKey}/flags/${item.key}`,
  };
}

function maintainerOf(item: ApiFlag): { maintainer?: Maintainer } {
  const member = item._maintainer;
  if (member) {
    const name = [member.firstName, member.lastName].filter((part) => part).join(' ');
    return { maintainer: { kind: 'member', email: member.email, ...(name ? { name } : {}) } };
  }
  const team = item._maintainerTeam;
  if (team) return { maintainer: { kind: 'team', key: team.key, name: team.name } };
  return {};
}

/** LaunchDarkly's marker OR any `codegen.deprecated` value; the message joins the non-blank values. */
function deprecationOf(item: ApiFlag): { deprecated: boolean; deprecationMessage?: string } {
  const values = item.customProperties?.['codegen.deprecated']?.value ?? [];
  const message = values
    .map((v) => v.trim())
    .filter((v) => v !== '')
    .join(' ');
  return {
    deprecated: item.deprecated || values.length > 0,
    ...(message ? { deprecationMessage: message } : {}),
  };
}

/** The value category used for kind inference; objects, arrays and null are all `json`. */
type ValueType = 'boolean' | 'string' | 'number' | 'json';

function valueType(value: unknown): ValueType {
  switch (typeof value) {
    case 'boolean':
    case 'string':
    case 'number':
      return typeof value as ValueType;
    default:
      return 'json';
  }
}

function inferKind(item: ApiFlag, warn: (message: string) => void): FlagKind {
  const values = item.variations.map((v) => v.value);
  if (item.kind === 'boolean') {
    const bad = values.findIndex((v) => typeof v !== 'boolean');
    if (bad !== -1) {
      throw new CodegenError(
        `flag ${item.key}: boolean flag has a non-boolean variation value ${JSON.stringify(values[bad]) ?? 'undefined'}`,
      );
    }
    return 'boolean';
  }
  const types = [...new Set(values.map(valueType))];
  if (types.length === 1 && (types[0] === 'string' || types[0] === 'number')) return types[0];
  if (types.length > 1) {
    warn(`flag ${item.key}: variations mix value types (${types.join(', ')}); treating it as json`);
  }
  return 'json';
}

const INT32_MIN = -(2 ** 31);
const INT32_MAX = 2 ** 31 - 1;

/** `double` unless `codegen.number` is `int`, which every variation must then fit. */
function numberType(item: ApiFlag): 'int' | 'double' {
  const prop = 'codegen.number';
  const setting = singlePropertyValue(item, prop);
  if (setting === undefined) return 'double';
  if (setting !== 'int') {
    throw new CodegenError(`flag ${item.key}: custom property ${prop} must be "int", got ${JSON.stringify(setting)}`);
  }
  for (const { value } of item.variations) {
    const n = value as number;
    if (!Number.isInteger(n) || n < INT32_MIN || n > INT32_MAX) {
      throw new CodegenError(`flag ${item.key}: ${prop} is int but variation value ${n} is not a 32-bit integer`);
    }
  }
  return 'int';
}
