/**
 * Snapshot → Flag model (DESIGN.md → Normalizer rules). Runs the same way on
 * a live fetch and on a replayed snapshot.
 */

import { CodegenError } from './errors.js';
import type { Flag, FlagModel, Maintainer } from './model.js';
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
    ...maintainerOf(item),
    ...deprecationOf(item),
    archived: item.archived,
    aliases: {},
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
