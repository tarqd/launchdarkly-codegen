/**
 * `check` (DESIGN.md → CLI): regenerate into memory and compare with what is
 * on disk, byte for byte. Never writes.
 */

import { resolve } from 'node:path';
import { summarizeReadBack, unifiedDiff, type NormalizeOptions, type Snapshot } from '@launchtarqly/core';
import type { Config } from './config.js';
import { readIfExists } from './fs.js';
import { generateTargets } from './generate.js';

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
  // error (exit 2) is never preceded by partial drift output.
  const outputs = generateTargets(config, snapshot, options).flatMap(({ emitter, files }) =>
    files.map((file) => ({ emitter, file })),
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
    // The summary is read back from both sides; if either can't be, the diff stands alone.
    const summary = oldText === undefined ? undefined : summarizeReadBack(emitter, oldText, file.contents);
    if (summary !== undefined) report += `${summary}\n`;
  }
  return { stale, report };
}
