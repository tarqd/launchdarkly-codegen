/**
 * Snapshot → Flag model (DESIGN.md → Normalizer rules). Runs the same way on
 * a live fetch and on a replayed snapshot.
 */

import { CodegenError } from './errors.js';
import type { Flag, FlagKind, FlagModel } from './model.js';
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
    deprecated: item.deprecated,
    archived: item.archived,
    aliases: {},
    uiUrl: `${snapshot.baseUri}/projects/${snapshot.projectKey}/flags/${item.key}`,
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
  const values = item.customProperties?.[prop]?.value ?? [];
  if (values.length === 0) return 'double';
  if (values.length > 1) {
    throw new CodegenError(
      `flag ${item.key}: custom property ${prop} must have exactly one value, got ${values.length}`,
    );
  }
  if (values[0] !== 'int') {
    throw new CodegenError(`flag ${item.key}: custom property ${prop} must be "int", got ${JSON.stringify(values[0])}`);
  }
  for (const { value } of item.variations) {
    const n = value as number;
    if (!Number.isInteger(n) || n < INT32_MIN || n > INT32_MAX) {
      throw new CodegenError(`flag ${item.key}: ${prop} is int but variation value ${n} is not a 32-bit integer`);
    }
  }
  return 'int';
}
