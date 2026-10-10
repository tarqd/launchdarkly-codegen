/**
 * Snapshot → Flag model (DESIGN.md → Normalizer rules). Runs the same way on
 * a live fetch and on a replayed snapshot.
 */

import { CodegenError } from './errors.js';
import type { Flag, FlagModel } from './model.js';
import type { ApiFlag, Snapshot } from './snapshot.js';

export function normalize(snapshot: Snapshot): FlagModel {
  const flags = snapshot.flagPages
    .flatMap((page) => page.items)
    .filter((item) => !item.archived)
    .map((item) => normalizeFlag(item, snapshot))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return { projectKey: snapshot.projectKey, flags };
}

function normalizeFlag(item: ApiFlag, snapshot: Snapshot): Flag {
  if (item.kind !== 'boolean') {
    // Kind inference for multivariate flags is not implemented yet.
    throw new CodegenError(`flag ${item.key}: ${item.kind} flags are not supported yet`);
  }
  return {
    key: item.key,
    name: item.name,
    description: item.description ?? '',
    kind: 'boolean',
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
