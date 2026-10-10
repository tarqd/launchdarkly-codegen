/**
 * Config file discovery, loading and validation (DESIGN.md → Configuration).
 * The file is one layer of settings; `settings.ts` layers env and CLI on top.
 */

import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CodegenError, type Emitter, type TargetConfig, type TargetId } from '@launchtarqly/core';
import { parse as parseYaml } from 'yaml';
import { BUILT_IN_EMITTERS } from './emitters.js';
import { resolveSettings, SETTINGS } from './settings.js';

export const CONFIG_FILENAMES = [
  'launchdarkly-codegen.config.json',
  'launchdarkly-codegen.config.yaml',
  'launchdarkly-codegen.config.js',
] as const;

/** The resolved config: file, env and CLI layered (see settings.ts). */
export interface Config {
  project: string;
  baseUri: string;
  /** Only ever from env or CLI, never the config file. */
  accessToken?: string;
  /** Tag filter: only flags with all of these tags. Absent means no filter. */
  tags?: string[];
  targets: TargetConfig[];
}

export interface LoadedConfig {
  config: Config;
  /** Absolute path of the config file. */
  path: string;
  /** Directory the config's relative paths (`out`) resolve against. */
  dir: string;
}

/** A config file read from disk but not yet validated. */
export interface ConfigFile {
  data: unknown;
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

async function parseFile(text: string, path: string): Promise<unknown> {
  switch (extname(path)) {
    case '.yaml':
    case '.yml':
      try {
        return parseYaml(text);
      } catch (err) {
        throw new CodegenError(`${path}: not valid YAML (${(err as Error).message})`);
      }
    case '.js':
    case '.mjs':
    case '.cjs':
      try {
        const mod = (await import(pathToFileURL(path).href)) as { default?: unknown };
        return mod.default;
      } catch (err) {
        throw new CodegenError(`${path}: cannot load (${(err as Error).message})`);
      }
    default:
      try {
        return JSON.parse(text);
      } catch (err) {
        throw new CodegenError(`${path}: not valid JSON (${(err as Error).message})`);
      }
  }
}

/** Reads `--config <path>` if given, otherwise the one default file in `cwd`. */
export async function readConfigFile(cwd: string, explicitPath?: string): Promise<ConfigFile> {
  if (explicitPath !== undefined) {
    const path = resolve(cwd, explicitPath);
    const text = await readIfExists(path);
    if (text === undefined) throw new CodegenError(`config file not found: ${path}`);
    return { data: await parseFile(text, path), path, dir: dirname(path) };
  }
  const found: { path: string; text: string }[] = [];
  for (const name of CONFIG_FILENAMES) {
    const path = resolve(cwd, name);
    const text = await readIfExists(path);
    if (text !== undefined) found.push({ path, text });
  }
  const [first, ...others] = found;
  if (first === undefined) {
    throw new CodegenError(`no config file found in ${cwd} (looked for ${CONFIG_FILENAMES.join(', ')})`);
  }
  if (others.length > 0) {
    throw new CodegenError(`more than one config file in ${cwd}: ${found.map((f) => f.path).join(', ')}; keep one or pass --config`);
  }
  return { data: await parseFile(first.text, first.path), path: first.path, dir: dirname(first.path) };
}

export interface ResolveOptions {
  cwd: string;
  env: Record<string, string | undefined>;
  /** Parsed CLI values keyed by flag name: `config`, `target` and every setting's flag. */
  cli: Record<string, unknown>;
  warn: (message: string) => void;
  /** Emitters that target ids and `sdkMajor` are validated against. */
  emitters?: readonly Emitter[];
}

/** Top-level config keys other than the scalar settings in settings.ts. */
const STRUCTURED_KEYS = ['targets'];

/**
 * Reads the config file, layers env and CLI settings over it, validates the
 * result and narrows `targets` to `--target` if given. Errors exit 2.
 */
export async function resolveConfig({
  cwd,
  env,
  cli,
  warn,
  emitters = BUILT_IN_EMITTERS,
}: ResolveOptions): Promise<LoadedConfig> {
  const file = await readConfigFile(cwd, typeof cli.config === 'string' ? cli.config : undefined);
  const { path, data } = file;
  const fail = (msg: string): never => {
    throw new CodegenError(`${path}: ${msg}`);
  };
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return fail('expected an object');
  const raw = data as Record<string, unknown>;

  const known: string[] = [...SETTINGS.map((s) => s.key), ...STRUCTURED_KEYS];
  for (const key of Object.keys(raw)) {
    if (!known.includes(key)) fail(`unknown key \`${key}\` (known keys: ${known.join(', ')})`);
  }

  const { project, baseUri, ...rest } = resolveSettings({ cli, env, file: raw, filePath: path, warn });
  if (project === undefined) {
    return fail('`project` is not set; set it in the config file, with LD_CODEGEN_PROJECT, or with --project');
  }
  for (const tag of rest.tags ?? []) {
    if (/[+,]/.test(tag)) {
      throw new CodegenError(
        `tag ${JSON.stringify(tag)}: tags cannot contain \`+\` or \`,\`, which separate tags and filters in the API's tag filter`,
      );
    }
  }
  const targets = selectTargets(parseTargets(raw.targets, emitters, fail), cli.target);
  // baseUri always has a default in SETTINGS.
  const config: Config = { ...rest, project, baseUri: normalizeBaseUri(baseUri!), targets };
  return { config, path, dir: file.dir };
}

/** An http(s) URL without trailing slashes, so UI links and API paths join cleanly. */
function normalizeBaseUri(baseUri: string): string {
  if (!/^https?:\/\/[^/]/.test(baseUri)) {
    throw new CodegenError(`base URI must be an http(s) URL, got ${JSON.stringify(baseUri)}`);
  }
  return baseUri.replace(/\/+$/, '');
}

function parseTargets(value: unknown, emitters: readonly Emitter[], fail: (msg: string) => never): TargetConfig[] {
  if (!Array.isArray(value) || value.length === 0) fail('`targets` must be a non-empty list');
  return (value as unknown[]).map((t, i): TargetConfig => {
    const at = `targets[${i}]`;
    if (typeof t !== 'object' || t === null || Array.isArray(t)) return fail(`${at} must be an object`);
    const target = t as Record<string, unknown>;
    const id = target.id;
    if (typeof id !== 'string') return fail(`${at}.id must be a string`);
    const emitter = emitters.find((e) => e.id === id);
    if (!emitter) {
      return fail(`${at}.id: unknown target \`${id}\` (supported: ${emitters.map((e) => e.id).join(', ')})`);
    }
    const { out, sdkMajor } = target;
    if (typeof out !== 'string' || out === '') return fail(`${at}.out must be a non-empty string`);
    if (typeof sdkMajor !== 'number') return fail(`${at}.sdkMajor must be a number`);
    if (!emitter.sdkMajors.includes(sdkMajor)) {
      fail(`${at}.sdkMajor: ${id} does not support ${sdkMajor} (supported: ${emitter.sdkMajors.join(', ')})`);
    }
    return { ...target, id: id as TargetId, out, sdkMajor };
  });
}

/** Narrows to the `--target` ids, keeping config order. An id not in the config is an error. */
function selectTargets(targets: TargetConfig[], selected: unknown): TargetConfig[] {
  if (!Array.isArray(selected) || selected.length === 0) return targets;
  const ids = selected as string[];
  const configured = targets.map((t): string => t.id);
  for (const id of ids) {
    if (!configured.includes(id)) {
      throw new CodegenError(`--target ${id}: no such target in the config (configured: ${configured.join(', ')})`);
    }
  }
  return targets.filter((t) => ids.includes(t.id));
}
