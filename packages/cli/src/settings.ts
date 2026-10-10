/**
 * Scalar settings that can come from the CLI, the environment or the config
 * file, in that order of precedence (DESIGN.md → Configuration).
 *
 * To add a setting, add a row to `SETTINGS`: the CLI flag, env var and config
 * key are all derived from it. Structured config (`targets`) lives in config.ts.
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
}

export const SETTINGS = [
  { key: 'project', flag: 'project', env: 'LD_CODEGEN_PROJECT', inFile: true },
  { key: 'baseUri', flag: 'base-uri', env: 'LD_BASE_URI', inFile: true, default: 'https://app.launchdarkly.com' },
  { key: 'accessToken', flag: 'access-token', env: 'LD_ACCESS_TOKEN', inFile: false },
] as const satisfies readonly SettingSpec[];

export type SettingKey = (typeof SETTINGS)[number]['key'];
export type Settings = { [K in SettingKey]?: string };

/** `parseArgs` option definitions for every setting. */
export function settingOptions(): Record<string, { type: 'string' }> {
  return Object.fromEntries(SETTINGS.map((s) => [s.flag, { type: 'string' as const }]));
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

export function resolveSettings({ cli, env, file, filePath, warn }: SettingLayers): Settings {
  const settings: Settings = {};
  for (const spec of SETTINGS as readonly SettingSpec[]) {
    let fromFile: string | undefined;
    if (file[spec.key] !== undefined) {
      if (!spec.inFile) {
        warn(`${filePath}: \`${spec.key}\` is ignored in the config file; set ${spec.env} or pass --${spec.flag}`);
      } else if (!nonEmpty(file[spec.key])) {
        throw new CodegenError(`${filePath}: \`${spec.key}\` must be a non-empty string`);
      } else {
        fromFile = file[spec.key] as string;
      }
    }
    const value = [cli[spec.flag], env[spec.env], fromFile, spec.default].find(nonEmpty);
    if (value !== undefined) settings[spec.key as SettingKey] = value;
  }
  return settings;
}
