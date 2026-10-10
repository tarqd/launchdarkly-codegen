/**
 * Settings that can come from the CLI, the environment or the config
 * file, in that order of precedence (DESIGN.md → Configuration).
 *
 * To add a setting, add a row to `SETTINGS`: the CLI flag, env var and config
 * key are all derived from it. A `multiple` setting is a list: a repeatable CLI
 * flag, a comma-separated env var, a list in the file. The highest layer that
 * sets it wins as a whole list. Structured config (`targets`) lives in config.ts.
 */

import { CodegenError } from '@launchtarqly/core';

export interface SettingSpec {
  /** Config file key and property on the resolved config. */
  readonly key: string;
  /** Long CLI flag, without the leading `--`. */
  readonly flag: string;
  /** Environment variable. Generator settings use `LD_CODEGEN_`; connection settings keep ldcli's names. */
  readonly env: string;
  /** False for secrets: the key is ignored in the config file, with a warning. */
  readonly inFile: boolean;
  readonly default?: string;
  /** A list setting (see above). */
  readonly multiple?: boolean;
}

export const SETTINGS = [
  { key: 'project', flag: 'project', env: 'LD_CODEGEN_PROJECT', inFile: true },
  { key: 'baseUri', flag: 'base-uri', env: 'LD_BASE_URI', inFile: true, default: 'https://app.launchdarkly.com' },
  { key: 'accessToken', flag: 'access-token', env: 'LD_ACCESS_TOKEN', inFile: false },
  { key: 'view', flag: 'view', env: 'LD_CODEGEN_VIEW', inFile: true },
  { key: 'tags', flag: 'tag', env: 'LD_CODEGEN_TAGS', inFile: true, multiple: true },
] as const satisfies readonly SettingSpec[];

type SettingRow = (typeof SETTINGS)[number];
export type SettingKey = SettingRow['key'];
export type Settings = {
  [S in SettingRow as S['key']]?: S extends { multiple: true } ? string[] : string;
};

/** `parseArgs` option definitions for every setting. */
export function settingOptions(): Record<string, { type: 'string'; multiple?: boolean }> {
  return Object.fromEntries(
    (SETTINGS as readonly SettingSpec[]).map((s) => [s.flag, { type: 'string' as const, multiple: s.multiple ?? false }]),
  );
}

export interface SettingLayers {
  /** Parsed CLI values, keyed by flag name. */
  cli: Record<string, unknown>;
  env: Record<string, string | undefined>;
  /** The config file's top-level object. */
  file: Record<string, unknown>;
  /** Path of the config file, for error messages. */
  filePath: string;
  warn: (message: string) => void;
}

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v !== '';
const nonBlank = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

/** A list from the CLI or env, blanks dropped; empty means unset. */
function listOf(values: readonly string[]): string[] | undefined {
  const list = values.map((v) => v.trim()).filter((v) => v !== '');
  return list.length > 0 ? list : undefined;
}

export function resolveSettings({ cli, env, file, filePath, warn }: SettingLayers): Settings {
  const settings: Record<string, string | string[]> = {};
  for (const spec of SETTINGS as readonly SettingSpec[]) {
    let fromFile: unknown;
    if (file[spec.key] !== undefined) {
      if (!spec.inFile) {
        warn(`${filePath}: \`${spec.key}\` is ignored in the config file; set ${spec.env} or pass --${spec.flag}`);
      } else {
        fromFile = checkFileValue(spec, file[spec.key], filePath);
      }
    }
    const value = spec.multiple
      ? [
          listOf((cli[spec.flag] as string[] | undefined) ?? []),
          listOf(env[spec.env]?.split(',') ?? []),
          fromFile as string[] | undefined,
        ].find((v) => v !== undefined)
      : [cli[spec.flag], env[spec.env], fromFile, spec.default].find(nonEmpty);
    if (value !== undefined) settings[spec.key] = value;
  }
  return settings as Settings;
}

function checkFileValue(spec: SettingSpec, value: unknown, filePath: string): string | string[] {
  if (spec.multiple) {
    if (!Array.isArray(value) || value.length === 0 || !value.every(nonBlank)) {
      throw new CodegenError(`${filePath}: \`${spec.key}\` must be a non-empty list of non-blank strings`);
    }
    return value;
  }
  if (!nonEmpty(value)) throw new CodegenError(`${filePath}: \`${spec.key}\` must be a non-empty string`);
  return value;
}
