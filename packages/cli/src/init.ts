/** `init`: writes a starter config (DESIGN.md → CLI). Never overwrites. */

import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { CodegenError } from '@launchtarqly/core';
import { CONFIG_FILENAMES } from './config.js';

export const DEFAULT_INIT_FILENAME = 'launchdarkly-codegen.config.yaml';

export const STARTER_CONFIG = `# launchdarkly-codegen config. Settings here can be overridden with
# LD_CODEGEN_* environment variables or CLI flags. The access token is never
# read from this file: set LD_ACCESS_TOKEN or pass --access-token.
project: my-project
# baseUri: https://app.eu.launchdarkly.com   # default https://app.launchdarkly.com

targets:
  - id: ts-server
    out: src/flags.generated.ts
    sdkMajor: 9
`;

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Writes the starter config to `explicitPath` or the default name in `cwd`; returns its path. */
export async function writeStarterConfig(cwd: string, explicitPath?: string): Promise<string> {
  const path = resolve(cwd, explicitPath ?? DEFAULT_INIT_FILENAME);
  const clashes = explicitPath !== undefined ? [path] : CONFIG_FILENAMES.map((f) => resolve(cwd, f));
  for (const candidate of clashes) {
    if (await exists(candidate)) throw new CodegenError(`${candidate} already exists; not overwriting it`);
  }
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(path, STARTER_CONFIG, { flag: 'wx' });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new CodegenError(`${path} already exists; not overwriting it`);
    }
    throw new CodegenError(`cannot write ${path}: ${(err as Error).message}`);
  }
  return path;
}
