/**
 * `check` (DESIGN.md → CLI): regenerate into memory and compare with what is
 * on disk, byte for byte. Never writes.
 */

import { resolve } from 'node:path';
import { unifiedDiff, type NormalizeOptions, type Snapshot } from '@launchtarqly/core';
import type { Config } from './config.js';
import { emitterFor } from './emitters.js';
import { readIfExists } from './fs.js';
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
      emitter: emitterFor(target.id),
      file,
    })),
  );

  let stale = false;
  let report = '';
  for (const { emitter, file } of outputs) {
    const onDisk = await readIfExists(resolve(baseDir, file.path), 'output file');
    if (onDisk === undefined && !failOnMissingOutput) continue;
    if (onDisk?.equals(Buffer.from(file.contents, 'utf8'))) continue;
    stale = true;
    const oldText = onDisk?.toString('utf8');
    report += unifiedDiff(file.path, oldText, file.contents);
    // The summary is read back from the old file; if it can't be, the diff stands alone.
    const summary = oldText === undefined ? undefined : emitter.summarizeChanges?.(oldText, file.contents);
    if (summary !== undefined) report += `${summary}\n`;
  }
  return { stale, report };
}
