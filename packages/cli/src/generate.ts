/**
 * Orchestration: snapshot → Flag model → every configured target's files.
 * Pure up to `writeFiles`, so `check` can reuse `generateTargets` in memory.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  normalize,
  type Emitter,
  type GeneratedFile,
  type NormalizeOptions,
  type Snapshot,
  type TargetConfig,
} from '@launchtarqly/core';
import type { Config } from './config.js';
import { emitterFor } from './emitters.js';
import { GENERATOR_VERSION } from './version.js';

/** One configured target's output, kept together so `check` knows which emitter wrote which file. */
export interface TargetOutput {
  target: TargetConfig;
  emitter: Emitter;
  files: GeneratedFile[];
}

/** Normalizes the snapshot once and emits every configured target from that one model. */
export function generateTargets(config: Config, snapshot: Snapshot, options: NormalizeOptions = {}): TargetOutput[] {
  const model = normalize(snapshot, {
    ...options,
    ...(config.tags && { tags: config.tags }),
    ...(config.view !== undefined && { view: config.view }),
  });
  const ctx = { generatorVersion: GENERATOR_VERSION };
  return config.targets.map((target) => {
    const emitter = emitterFor(target.id);
    return { target, emitter, files: emitter.emit(model, target, ctx) };
  });
}

/** Every target's files, in config order. */
export function generateFiles(config: Config, snapshot: Snapshot, options: NormalizeOptions = {}): GeneratedFile[] {
  return generateTargets(config, snapshot, options).flatMap((output) => output.files);
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
