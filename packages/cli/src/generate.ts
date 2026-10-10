/**
 * Orchestration: snapshot → Flag model → every configured target's files.
 * Pure up to `writeFiles`, so `check` can reuse `generateFiles` in memory.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { normalize, type GeneratedFile, type NormalizeOptions, type Snapshot } from '@launchtarqly/core';
import type { Config } from './config.js';
import { emitterFor } from './emitters.js';
import { GENERATOR_VERSION } from './version.js';

export function generateFiles(config: Config, snapshot: Snapshot, options: NormalizeOptions = {}): GeneratedFile[] {
  const model = normalize(snapshot, { ...options, ...(config.tags && { tags: config.tags }) });
  const ctx = { generatorVersion: GENERATOR_VERSION };
  return config.targets.flatMap((target) => emitterFor(target.id).emit(model, target, ctx));
}

/** Writes files, resolving their paths against `baseDir` (the config file's directory). */
export async function writeFiles(files: GeneratedFile[], baseDir: string): Promise<string[]> {
  const written: string[] = [];
  for (const file of files) {
    const path = resolve(baseDir, file.path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, file.contents);
    written.push(path);
  }
  return written;
}
