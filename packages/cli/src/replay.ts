/**
 * Checks a replayed snapshot (`--from-snapshot`) against the resolved config
 * (DESIGN.md → CLI). The snapshot fixes what was fetched, so a config that
 * asks for something else is reported instead of silently ignored.
 */

import { CodegenError, type Snapshot } from '@launchtarqly/core';
import { viewAndTagsError, type LoadedConfig } from './config.js';

/**
 * - A project other than the snapshot's is exit 2.
 * - A base URI set explicitly (CLI, env or file) other than the snapshot's is
 *   a warning; the snapshot's base URI is still used, so replay output stays
 *   byte-identical to the run that recorded it.
 * - A view and tags, one from the snapshot and one from the config, is exit 2,
 *   as when both are configured.
 */
export function checkReplay(
  { config, defaulted }: Pick<LoadedConfig, 'config' | 'defaulted'>,
  snapshot: Snapshot,
  warn: (message: string) => void,
): void {
  if (config.project !== snapshot.projectKey) {
    throw new CodegenError(
      `project \`${config.project}\` is configured but the snapshot was fetched from project \`${snapshot.projectKey}\``,
    );
  }
  const recordedBaseUri = snapshot.baseUri.replace(/\/+$/, '');
  if (!defaulted.has('baseUri') && config.baseUri !== recordedBaseUri) {
    warn(
      `base URI \`${config.baseUri}\` is configured but the snapshot was fetched from \`${snapshot.baseUri}\`; using the snapshot's`,
    );
  }
  if (snapshot.view !== undefined && config.tags !== undefined) {
    throw viewAndTagsError(snapshot.view.key, config.tags, '; the view is from the snapshot');
  }
  if (snapshot.tags !== undefined && config.view !== undefined) {
    throw viewAndTagsError(config.view, snapshot.tags, '; the tags are from the snapshot');
  }
}
