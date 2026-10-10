/**
 * Config file loading (DESIGN.md → Configuration). Only JSON is read so far;
 * YAML/JS configs, env vars and CLI overrides are layered on later.
 */

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { CodegenError, type TargetConfig, type TargetId } from '@launchtarqly/core';

export const CONFIG_FILENAMES = ['launchdarkly-codegen.config.json'] as const;

export interface Config {
  project: string;
  baseUri?: string;
  targets: TargetConfig[];
  check?: CheckConfig;
}

export interface CheckConfig {
  /** A missing output file is stale (default `true`); `false` skips it. */
  failOnMissingOutput?: boolean;
}

export interface LoadedConfig {
  config: Config;
  /** Absolute path of the config file. */
  path: string;
  /** Directory the config's relative paths (`out`) resolve against. */
  dir: string;
}

async function readIfExists(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw new CodegenError(`cannot read config ${path}: ${(err as Error).message}`);
  }
}

/** Loads `--config <path>` if given, otherwise the default file in `cwd`. */
export async function loadConfig(cwd: string, explicitPath?: string): Promise<LoadedConfig> {
  const candidates = explicitPath ? [resolve(cwd, explicitPath)] : CONFIG_FILENAMES.map((f) => resolve(cwd, f));
  for (const path of candidates) {
    const text = await readIfExists(path);
    if (text === undefined) continue;
    return { config: parseConfig(text, path), path, dir: dirname(path) };
  }
  throw new CodegenError(
    explicitPath ? `config file not found: ${candidates[0]}` : `no config file found in ${cwd} (looked for ${CONFIG_FILENAMES.join(', ')})`,
  );
}

function parseConfig(text: string, path: string): Config {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new CodegenError(`${path}: not valid JSON (${(err as Error).message})`);
  }
  const fail = (msg: string): never => {
    throw new CodegenError(`${path}: ${msg}`);
  };
  if (typeof data !== 'object' || data === null || Array.isArray(data)) fail('expected a JSON object');
  const raw = data as Record<string, unknown>;
  if (typeof raw.project !== 'string' || raw.project === '') fail('`project` must be a non-empty string');
  if (raw.baseUri !== undefined && typeof raw.baseUri !== 'string') fail('`baseUri` must be a string');
  if (!Array.isArray(raw.targets) || raw.targets.length === 0) fail('`targets` must be a non-empty list');

  const targets = (raw.targets as unknown[]).map((t, i): TargetConfig => {
    if (typeof t !== 'object' || t === null) return fail(`targets[${i}] must be an object`);
    const target = t as Record<string, unknown>;
    if (typeof target.id !== 'string') fail(`targets[${i}].id must be a string`);
    if (typeof target.out !== 'string' || target.out === '') fail(`targets[${i}].out must be a non-empty string`);
    if (typeof target.sdkMajor !== 'number') fail(`targets[${i}].sdkMajor must be a number`);
    return { ...target, id: target.id as TargetId, out: target.out as string, sdkMajor: target.sdkMajor as number };
  });

  const config: Config = { project: raw.project as string, targets };
  if (typeof raw.baseUri === 'string') config.baseUri = raw.baseUri;
  if (raw.check !== undefined) config.check = parseCheckConfig(raw.check, fail);
  return config;
}

function parseCheckConfig(raw: unknown, fail: (msg: string) => never): CheckConfig {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return fail('`check` must be an object');
  const { failOnMissingOutput } = raw as Record<string, unknown>;
  if (failOnMissingOutput !== undefined && typeof failOnMissingOutput !== 'boolean') {
    fail('`check.failOnMissingOutput` must be a boolean');
  }
  return failOnMissingOutput === undefined ? {} : { failOnMissingOutput: failOnMissingOutput as boolean };
}
