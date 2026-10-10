/**
 * Snapshot format and replay (DESIGN.md → Fetcher). A snapshot is the raw
 * LaunchDarkly API responses for one project; nothing here interprets them.
 * The live fetcher (later) produces the same `Snapshot` shape.
 */

import { readFile } from 'node:fs/promises';
import { CodegenError } from './errors.js';

/**
 * One item of `GET /api/v2/flags/{projectKey}` (LD-API-Version 20240415).
 * Only the fields the normalizer reads are typed; the rest pass through.
 */
export interface ApiFlag {
  key: string;
  name: string;
  description?: string;
  kind: 'boolean' | 'multivariate';
  variations: { value: unknown; _id?: string; name?: string }[];
  archived: boolean;
  deprecated: boolean;
  tags: string[];
  clientSideAvailability?: { usingEnvironmentId: boolean; usingMobileKey: boolean };
  includeInSnippet?: boolean;
  customProperties?: Record<string, { name: string; value: string[] }>;
  _maintainer?: { email: string; firstName?: string; lastName?: string; [field: string]: unknown };
  _maintainerTeam?: { key: string; name: string; [field: string]: unknown };
  [field: string]: unknown;
}

/** One page of the flags list, as returned by the API. */
export interface ApiFlagsPage {
  items: ApiFlag[];
  totalCount?: number;
  _links?: Record<string, { href: string; type?: string }>;
  [field: string]: unknown;
}

export const SNAPSHOT_VERSION = 1;

export interface Snapshot {
  snapshotVersion: typeof SNAPSHOT_VERSION;
  projectKey: string;
  baseUri: string;
  /**
   * The tag filter the flags list was fetched with (`filter=tags:a+b`), present
   * only when one was set. The normalizer re-applies it.
   */
  tags?: string[];
  /**
   * The view the run used, present only when one was set: its key and the
   * flag keys linked to it (`items[].resourceKey` of the linked-flags pages),
   * in fetch order. The normalizer keeps only these flags.
   */
  view?: { key: string; memberKeys: string[] };
  /** The flags-list pages, in fetch order. */
  flagPages: ApiFlagsPage[];
}

/** Parses snapshot JSON text, checking the envelope (not the API payloads). */
export function parseSnapshot(text: string, source = 'snapshot'): Snapshot {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new CodegenError(`${source}: not valid JSON (${(err as Error).message})`);
  }
  if (typeof data !== 'object' || data === null) {
    throw new CodegenError(`${source}: expected a JSON object`);
  }
  const s = data as Partial<Snapshot>;
  if (s.snapshotVersion !== SNAPSHOT_VERSION) {
    throw new CodegenError(
      `${source}: unsupported snapshotVersion ${JSON.stringify(s.snapshotVersion)} (expected ${SNAPSHOT_VERSION})`,
    );
  }
  if (typeof s.projectKey !== 'string' || typeof s.baseUri !== 'string' || !Array.isArray(s.flagPages)) {
    throw new CodegenError(`${source}: missing projectKey, baseUri or flagPages`);
  }
  if (s.tags !== undefined && !(Array.isArray(s.tags) && s.tags.every((t) => typeof t === 'string'))) {
    throw new CodegenError(`${source}: \`tags\` must be a list of strings`);
  }
  if (s.view !== undefined && !isView(s.view)) {
    throw new CodegenError(`${source}: \`view\` must be {key: string, memberKeys: string[]}`);
  }
  return s as Snapshot;
}

function isView(v: unknown): v is NonNullable<Snapshot['view']> {
  if (typeof v !== 'object' || v === null) return false;
  const { key, memberKeys } = v as { key?: unknown; memberKeys?: unknown };
  return typeof key === 'string' && Array.isArray(memberKeys) && memberKeys.every((k) => typeof k === 'string');
}

/** Reads and parses a snapshot file (`--from-snapshot`). */
export async function readSnapshot(path: string): Promise<Snapshot> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    throw new CodegenError(`cannot read snapshot ${path}: ${(err as Error).message}`);
  }
  return parseSnapshot(text, path);
}
