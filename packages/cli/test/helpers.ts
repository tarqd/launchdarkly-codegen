import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { run } from '../src/index.js';

export const REPO_ROOT = resolve(import.meta.dirname, '../../..');
export const SNAPSHOTS_DIR = join(REPO_ROOT, 'fixtures/snapshots');
export const GOLDEN_DIR = join(REPO_ROOT, 'fixtures/golden');

/** A temp directory holding `launchdarkly-codegen.config.json` with `config`. */
export async function projectDir(config: unknown): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ld-codegen-'));
  await writeFile(join(dir, 'launchdarkly-codegen.config.json'), JSON.stringify(config, null, 2));
  return dir;
}

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Runs the CLI in-process with `cwd` and captured output. */
export async function runCli(args: string[], cwd: string): Promise<CliResult> {
  let stdout = '';
  let stderr = '';
  const exitCode = await run(args, {
    cwd,
    env: {},
    stdout: (s) => (stdout += s),
    stderr: (s) => (stderr += s),
  });
  return { exitCode, stdout, stderr };
}
