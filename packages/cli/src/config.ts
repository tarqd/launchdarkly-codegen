/**
 * Config file discovery, loading and validation (DESIGN.md → Configuration).
 * The file is one layer of settings; `settings.ts` layers env and CLI on top.
 */

import { dirname, extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CodegenError, parseTargetOptions, type Emitter, type TargetConfig, type TargetId } from '@launchtarqly/core';
import { parse as parseYaml } from 'yaml';
import { BUILT_IN_EMITTERS } from './emitters.js';
import { readIfExists } from './fs.js';
import { resolveSettings, SETTINGS, type SettingKey } from './settings.js';

export const CONFIG_FILENAMES = [
  'launchdarkly-codegen.config.json',
  'launchdarkly-codegen.config.yaml',
  'launchdarkly-codegen.config.js',
] as const;

/** The resolved settings `snapshot` needs: what to fetch and how to connect. */
export interface ConnectionConfig {
  project: string;
  baseUri: string;
  /** Only ever from env or CLI, never the config file. */
  accessToken?: string;
  /** Tag filter: only flags with all of these tags. Absent means no filter. */
  tags?: string[];
  /** View key: only flags linked to this view. Never set together with `tags`. */
  view?: string;
}

/** The resolved config for `generate` and `check`: file, env and CLI layered (see settings.ts). */
export interface Config extends ConnectionConfig {
  targets: TargetConfig[];
  check?: CheckConfig;
}

export interface CheckConfig {
  /** A missing output file is stale (default `true`); `false` skips it. */
  failOnMissingOutput?: boolean;
}

/** Where a config file is. */
export interface ConfigLocation {
  /** Absolute path of the config file. */
  path: string;
  /** Directory the config's relative paths (`out`) resolve against. */
  dir: string;
}

/** A config file read from disk but not yet validated. */
export interface ConfigFile extends ConfigLocation {
  data: unknown;
}

export interface ResolvedConnection {
  config: ConnectionConfig;
  /** The config file, if one was read. */
  file?: ConfigLocation;
  /** Settings that no layer set, so they hold their default (see settings.ts). */
  defaulted: ReadonlySet<SettingKey>;
}

export interface LoadedConfig extends ResolvedConnection {
  config: Config;
  file: ConfigLocation;
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

async function readText(path: string): Promise<string | undefined> {
  return (await readIfExists(path, 'config'))?.toString('utf8');
}

/**
 * Reads `--config <path>` if given, otherwise the one default file in `cwd`.
 * With `optional`, a missing default file returns `undefined` instead of
 * failing; a missing `--config` file always fails.
 */
export async function readConfigFile(cwd: string, explicitPath?: string): Promise<ConfigFile>;
export async function readConfigFile(
  cwd: string,
  explicitPath: string | undefined,
  options: { optional: true },
): Promise<ConfigFile | undefined>;
export async function readConfigFile(
  cwd: string,
  explicitPath?: string,
  { optional = false }: { optional?: boolean } = {},
): Promise<ConfigFile | undefined> {
  if (explicitPath !== undefined) {
    const path = resolve(cwd, explicitPath);
    const text = await readText(path);
    if (text === undefined) throw new CodegenError(`config file not found: ${path}`);
    return { data: await parseFile(text, path), path, dir: dirname(path) };
  }
  const found: { path: string; text: string }[] = [];
  for (const name of CONFIG_FILENAMES) {
    const path = resolve(cwd, name);
    const text = await readText(path);
    if (text !== undefined) found.push({ path, text });
  }
  const [first, ...others] = found;
  if (first === undefined) {
    if (optional) return undefined;
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
const STRUCTURED_KEYS = ['targets', 'check'];

/**
 * The config for `generate` and `check`: reads the config file (which must
 * exist), layers env and CLI settings over it, validates the result and
 * narrows `targets` to `--target` if given. Errors exit 2.
 */
export async function resolveConfig(options: ResolveOptions): Promise<LoadedConfig> {
  const { cli, emitters = BUILT_IN_EMITTERS } = options;
  const file = await readConfigFile(options.cwd, configFlag(cli));
  const { raw, fail, ...connection } = resolveLayers(options, file);
  const targets = selectTargets(parseTargets(raw.targets, emitters, fail), cli.target);
  const config: Config = { ...connection.config, targets };
  if (raw.check !== undefined) config.check = parseCheckConfig(raw.check, fail);
  return { config, file: locationOf(file), defaulted: connection.defaulted };
}

/**
 * The settings for `snapshot`: like `resolveConfig`, but the config file is
 * optional and `targets` and `check` are not read, since nothing is generated.
 */
export async function resolveConnection(options: ResolveOptions): Promise<ResolvedConnection> {
  const file = await readConfigFile(options.cwd, configFlag(options.cli), { optional: true });
  const { config, defaulted } = resolveLayers(options, file);
  return { config, defaulted, ...(file && { file: locationOf(file) }) };
}

function configFlag(cli: Record<string, unknown>): string | undefined {
  return typeof cli.config === 'string' ? cli.config : undefined;
}

function locationOf({ path, dir }: ConfigLocation): ConfigLocation {
  return { path, dir };
}

/**
 * The settings layered over `file` (or over nothing), validated, plus the
 * file's raw object and its error helper for the structured keys.
 */
function resolveLayers(
  { env, cli, warn }: ResolveOptions,
  file: ConfigFile | undefined,
): ResolvedConnection & { raw: Record<string, unknown>; fail: (msg: string) => never } {
  const fail = (msg: string): never => {
    throw new CodegenError(file ? `${file.path}: ${msg}` : msg);
  };
  const data = file ? file.data : {};
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return fail('expected an object');
  const raw = data as Record<string, unknown>;

  const known: string[] = [...SETTINGS.map((s) => s.key), ...STRUCTURED_KEYS];
  for (const key of Object.keys(raw)) {
    if (!known.includes(key)) fail(`unknown key \`${key}\` (known keys: ${known.join(', ')})`);
  }

  const { values, defaulted } = resolveSettings({ cli, env, file: raw, filePath: file?.path ?? '', warn });
  const { project, baseUri, ...rest } = values;
  if (project === undefined) {
    const where = file ? 'in the config file, ' : '';
    return fail(`\`project\` is not set; set it ${where}with LD_CODEGEN_PROJECT, or with --project`);
  }
  if (rest.view !== undefined && rest.tags !== undefined) throw viewAndTagsError(rest.view, rest.tags);
  for (const tag of rest.tags ?? []) {
    if (/[+,]/.test(tag)) {
      throw new CodegenError(
        `tag ${JSON.stringify(tag)}: tags cannot contain \`+\` or \`,\`, which separate tags and filters in the API's tag filter`,
      );
    }
  }
  // baseUri always has a default in SETTINGS.
  const config: ConnectionConfig = { ...rest, project, baseUri: normalizeBaseUri(baseUri!) };
  return { config, defaulted, raw, fail };
}

/**
 * `view` and `tags` are mutually exclusive, whether set in the config or
 * recorded in a snapshot; `note` says where they came from if not the config.
 */
export function viewAndTagsError(view: string, tags: readonly string[], note = ''): CodegenError {
  return new CodegenError(
    `\`view\` and \`tags\` cannot both be set (view ${JSON.stringify(view)}, tags ${JSON.stringify(tags)}${note}); use one or the other`,
  );
}

/** An http(s) URL without trailing slashes, so UI links and API paths join cleanly. */
function normalizeBaseUri(baseUri: string): string {
  if (!/^https?:\/\/[^/]/.test(baseUri)) {
    throw new CodegenError(`base URI must be an http(s) URL, got ${JSON.stringify(baseUri)}`);
  }
  return baseUri.replace(/\/+$/, '');
}

/** The keys every target has; any other key must be one of the target's options, as its emitter declares them. */
const TARGET_KEYS = ['id', 'out', 'sdkMajor'];

/**
 * Every configured target, validated, its options parsed by its own emitter.
 * Runs before `--target` narrows the list, so a bad target fails every run.
 */
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
    const declarations = emitter.options ?? {};
    const known = [...TARGET_KEYS, ...Object.keys(declarations)];
    for (const key of Object.keys(target)) {
      if (!known.includes(key)) fail(`${at}: unknown key \`${key}\` for ${id} (known keys: ${known.join(', ')})`);
    }
    const extensions = emitter.outExtensions;
    if (extensions && !extensions.some((ext) => out.endsWith(ext))) {
      fail(`${at}.out must end in ${orList(extensions)}, got ${JSON.stringify(out)}`);
    }
    const options = parseTargetOptions(declarations, target, (key, message) => fail(`${at}.${key} ${message}`));
    return { id: id as TargetId, out, sdkMajor, options };
  });
}

/** `a`, `a or b`, `a, b or c`. */
function orList(items: readonly string[]): string {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
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

function parseCheckConfig(raw: unknown, fail: (msg: string) => never): CheckConfig {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return fail('`check` must be an object');
  const { failOnMissingOutput } = raw as Record<string, unknown>;
  if (failOnMissingOutput !== undefined && typeof failOnMissingOutput !== 'boolean') {
    fail('`check.failOnMissingOutput` must be a boolean');
  }
  return failOnMissingOutput === undefined ? {} : { failOnMissingOutput: failOnMissingOutput as boolean };
}
