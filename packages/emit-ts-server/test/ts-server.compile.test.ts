/**
 * Compile test: each golden ts-server file is dropped into
 * fixtures/compile/ts-server (pinned to @launchdarkly/node-server-sdk v9) and
 * must pass `tsc --noEmit` together with the fixture's usage code.
 * Run with `pnpm test:compile`.
 */
import { execFile } from 'node:child_process';
import { copyFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '../../..');
const GOLDEN_DIR = join(REPO_ROOT, 'fixtures/golden/ts-server');
const PROJECT_DIR = join(REPO_ROOT, 'fixtures/compile/ts-server');
const TSC = join(PROJECT_DIR, 'node_modules/typescript/bin/tsc');

const goldens = (await readdir(GOLDEN_DIR)).filter((f) => f.endsWith('.ts')).sort();

describe('ts-server golden output compiles against Node server SDK v9', () => {
  it.each(goldens)('%s', async (file) => {
    await copyFile(join(GOLDEN_DIR, file), join(PROJECT_DIR, 'src/flags.generated.ts'));
    const result = await promisify(execFile)(process.execPath, [TSC, '--noEmit', '-p', PROJECT_DIR]).then(
      ({ stdout }) => ({ ok: true, output: stdout }),
      (err: { stdout?: string; stderr?: string }) => ({ ok: false, output: `${err.stdout ?? ''}${err.stderr ?? ''}` }),
    );
    expect(result.output).toBe('');
    expect(result.ok).toBe(true);
  });
});
