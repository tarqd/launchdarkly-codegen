/**
 * `check` (DESIGN.md → CLI): regenerate into memory and compare with what is
 * on disk, byte for byte. Never writes.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CodegenError, summarizeFlagChanges, unifiedDiff, type NormalizeOptions, type Snapshot } from '@launchtarqly/core';
import type { Config } from './config.js';
import { generateFiles } from './generate.js';

export interface CheckResult {
  stale: boolean;
  /** Human-readable output: diffs and summaries for stale files. */
  report: string;
}

export async function checkFiles(
  config: Config,
  snapshot: Snapshot,
  baseDir: string,
  options: NormalizeOptions = {},
): Promise<CheckResult> {
  const failOnMissingOutput = config.check?.failOnMissingOutput ?? true;
  // Generate every target before reading anything, so a config, model or API
  // error (exit 2) is never preceded by partial drift output. Targets are
  // generated one at a time to know which target wrote which file; normalizer
  // warnings are the same each time, so only the first pass reports them.
  const outputs = config.targets.flatMap((target, i) =>
    generateFiles({ ...config, targets: [target] }, snapshot, i === 0 ? options : {}).map((file) => ({
      target,
      file,
    })),
  );

  let stale = false;
  let report = '';
  for (const { target, file } of outputs) {
    const onDisk = await readIfExists(resolve(baseDir, file.path));
    if (onDisk === undefined && !failOnMissingOutput) continue;
    if (onDisk?.equals(Buffer.from(file.contents, 'utf8'))) continue;
    stale = true;
    const oldText = onDisk?.toString('utf8');
    report += unifiedDiff(file.path, oldText, file.contents);
    // The summary is read back from the old file; if it can't be parsed, the diff stands alone.
    const summary =
      target.id === 'ts-server' && oldText !== undefined ? summarizeFlagChanges(oldText, file.contents) : undefined;
    if (summary !== undefined) report += `${summary}\n`;
  }
  return { stale, report };
}

async function readIfExists(path: string): Promise<Buffer | undefined> {
  try {
    return await readFile(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw new CodegenError(`cannot read ${path}: ${(err as Error).message}`);
  }
}
