/**
 * Compile test: each golden go file is dropped into fixtures/compile/go
 * (pinned to go-server-sdk v7.19.0, Go 1.25) and must leave `gofmt -l`
 * silent and pass `go vet ./...` and `staticcheck -checks all` together with
 * the fixture's consumer code. The flag-kinds golden is also built with the
 * `flagkinds` tag, which calls every method form for every kind.
 * Run with `pnpm test:compile`; needs `go` and staticcheck 2025.1.1 on the PATH
 * (or GOPATH/bin).
 */
import { execFile } from 'node:child_process';
import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { beforeAll, describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '../../..');
const GOLDEN_DIR = join(REPO_ROOT, 'fixtures/golden/go');
const PROJECT_DIR = join(REPO_ROOT, 'fixtures/compile/go');
const GENERATED = join(PROJECT_DIR, 'ldflags/flags_gen.go');

/** The SDK's own floor (its go.mod says `go 1.25.0`); `GOTOOLCHAIN` downloads it if the local go is older. */
const GO_TOOLCHAIN = process.env.GOTOOLCHAIN ?? 'go1.25.0';
const GOPATH_BIN = join(process.env.GOPATH ?? join(homedir(), 'go'), 'bin');
const env = {
  ...process.env,
  GOTOOLCHAIN: GO_TOOLCHAIN,
  GOFLAGS: '-mod=readonly',
  PATH: `${process.env.PATH ?? ''}${delimiter}${GOPATH_BIN}`,
};

async function run(cmd: string, args: string[]): Promise<{ ok: boolean; output: string }> {
  return promisify(execFile)(cmd, args, { cwd: PROJECT_DIR, env }).then(
    ({ stdout, stderr }) => ({ ok: true, output: `${stdout}${stderr}` }),
    (err: { stdout?: string; stderr?: string; message: string }) => ({
      ok: false,
      output: `${err.stdout ?? ''}${err.stderr ?? ''}` || err.message,
    }),
  );
}

const goldens = (await readdir(GOLDEN_DIR)).filter((f) => f.endsWith('.go')).sort();

describe('go golden output compiles against go-server-sdk v7', () => {
  // Fetch the toolchain and modules first, so their download logs don't reach the checks' output.
  beforeAll(async () => {
    await mkdir(dirname(GENERATED), { recursive: true }); // git keeps no empty ldflags/
    const download = await run('go', ['mod', 'download']);
    expect(download.ok, download.output).toBe(true);
  }, 600_000);

  it('runs on the pinned Go toolchain', async () => {
    const result = await run('go', ['env', 'GOVERSION']);
    expect(result.output.trim()).toBe(GO_TOOLCHAIN);
  });

  it.each(goldens)('%s', async (file) => {
    await copyFile(join(GOLDEN_DIR, file), GENERATED);
    const tags = file === 'flag-kinds.go' ? ['-tags', 'flagkinds'] : [];

    // `go fmt` runs the toolchain's gofmt, so this is Go 1.25's formatter too.
    const gofmt = await run('go', ['run', 'cmd/gofmt', '-l', '.']);
    expect(gofmt.output).toBe('');
    expect(gofmt.ok).toBe(true);

    const vet = await run('go', ['vet', ...tags, './...']);
    expect(vet.output).toBe('');
    expect(vet.ok).toBe(true);

    const staticcheck = await run('staticcheck', ['-checks', 'all', ...tags, './...']);
    expect(staticcheck.output).toBe('');
    expect(staticcheck.ok).toBe(true);
  });
});
