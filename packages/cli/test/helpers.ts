import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { ApiFlag } from '@launchtarqly/core';
import { snapshotOf } from '../../core/test/builders.js';
import { GENERATOR_VERSION, run, type RunIO } from '../src/index.js';

export const REPO_ROOT = resolve(import.meta.dirname, '../../..');
export const SNAPSHOTS_DIR = join(REPO_ROOT, 'fixtures/snapshots');
export const GOLDEN_DIR = join(REPO_ROOT, 'fixtures/golden');

/**
 * The generator version in the golden files' headers. It stays put while
 * releases bump the real version, so `withGoldenVersion` rewrites generated
 * output to it before comparing.
 */
export const GOLDEN_GENERATOR_VERSION = '0.1.0';

/** `text` with its header's generator version replaced by `GOLDEN_GENERATOR_VERSION`. */
export function withGoldenVersion(text: string): string {
  return text.replace(`generator: ${GENERATOR_VERSION}`, `generator: ${GOLDEN_GENERATOR_VERSION}`);
}

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

/** Writes `snapshot.json` in `dir`: a `my-project` snapshot with one page of `items`. Returns its path. */
export async function writeSnapshot(dir: string, items: ApiFlag[]): Promise<string> {
  const path = join(dir, 'snapshot.json');
  await writeFile(path, JSON.stringify(snapshotOf(items)));
  return path;
}

/** Flag keys in the `FlagKeys` object of the ts-server file `dir/file`, sorted. */
export async function generatedKeys(dir: string, file = 'flags.ts'): Promise<string[]> {
  const text = await readFile(join(dir, file), 'utf8');
  const block = text.slice(text.indexOf('FlagKeys'));
  return [...block.matchAll(/^\s+\w+: '([^']+)',$/gm)].map((m) => m[1]!).sort();
}

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Runs the CLI in-process with `cwd` and captured output; `io` can set env and a fake fetch. */
export async function runCli(
  args: string[],
  cwd: string,
  io: Partial<Pick<RunIO, 'env' | 'fetch'>> = {},
): Promise<CliResult> {
  let stdout = '';
  let stderr = '';
  const exitCode = await run(args, {
    cwd,
    env: {},
    ...io,
    stdout: (s) => (stdout += s),
    stderr: (s) => (stderr += s),
  });
  return { exitCode, stdout, stderr };
}
