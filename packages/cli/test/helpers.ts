import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { run } from '../src/index.js';

export const REPO_ROOT = resolve(import.meta.dirname, '../../..');
export const SNAPSHOTS_DIR = join(REPO_ROOT, 'fixtures/snapshots');
export const GOLDEN_DIR = join(REPO_ROOT, 'fixtures/golden');

/**
 * A temp directory holding `launchdarkly-codegen.config.json` with `config`.
 * A string `config` is written verbatim under `filename` instead.
 */
export async function projectDir(config: unknown, filename = 'launchdarkly-codegen.config.json'): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ld-codegen-'));
  const text = typeof config === 'string' ? config : JSON.stringify(config, null, 2);
  await writeFile(join(dir, filename), text);
  return dir;
}

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Runs the CLI in-process with `cwd` and captured output. */
export async function runCli(
  args: string[],
  cwd: string,
  env: Record<string, string | undefined> = {},
): Promise<CliResult> {
  let stdout = '';
  let stderr = '';
  const exitCode = await run(args, {
    cwd,
    env,
    stdout: (s) => (stdout += s),
    stderr: (s) => (stderr += s),
  });
  return { exitCode, stdout, stderr };
}
