/**
 * Compile test: each golden go file is dropped into fixtures/compile/go
 * (pinned to go-server-sdk v7.19.0, Go 1.25) and must leave `gofmt -l`
 * silent and pass `go vet ./...` and `staticcheck -checks all` together with
 * the fixture's consumer code. The flag-kinds golden is also built with the
 * `flagkinds` tag, which calls every method form for every kind, and the
 * doc-comments golden with the `deprecated` tag, which calls a deprecated
 * flag's four methods and constant: staticcheck must report SA1019 for exactly
 * those five uses. A fuzz case runs random names and descriptions through the
 * real emitter and asserts gofmt leaves the doc comments alone.
 * Run with `pnpm test:compile`; needs `go` and staticcheck 2025.1.1 on the PATH
 * (or GOPATH/bin).
 */
import { execFile } from 'node:child_process';
import { copyFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Flag } from '@launchtarqly/core';
import { goEmitter } from '../src/index.js';
import { modelFlag } from '../../core/test/builders.js';

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

/** Build tags for the goldens whose fixture code is behind one. */
const TAGS: Record<string, string[]> = {
  'flag-kinds.go': ['-tags', 'flagkinds'],
  'doc-comments.go': ['-tags', 'deprecated'],
};

// ---- doc comment fuzz, ported from prototype/go-emitter's docfuzz/fuzz.mjs ----

/** Fragments gofmt might reinterpret in a doc comment, plus filler; random names and descriptions join them. */
const PIECES = [
  'Routes eligible users', 'to the flow', '.', ':', '``quoted``', "''x''", "it's", "don't",
  '*/', '/*', '# Heading', '#tag', '- item', '* item', '1. one', '2) two', '+ plus', '[Link]: https://x.y/z',
  '[Name]', 'https://example.com/a_b', 'func f() {', 'line\\', '\t', '  ', '    indented', '\r', '\r\n',
  '\n', '\n', '\n\n', '\n\n\n', '  \n', 'Ünïcödé', '日本語', '\u0000', '\ufeff', 'Deprecated: old', '//go:generate x',
  'A', 'Title Case Words', 'v1.2', 'e.g. this', '"q"', '<b>&amp;</b>', '%d', '{x}', 'end', ' ', ' ', ' ',
];
const FUZZ_FLAGS = 3000;
const FUZZ_CONFIG = { id: 'go', out: 'ldflags/flags_gen.go', sdkMajor: 7, options: { package: 'ldflags' } } as const;

/** The prototype's deterministic LCG, so a failure reproduces. */
function fuzzText(seed: number): () => string {
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  return () => {
    let s = '';
    const n = 1 + Math.floor(rnd() * 12);
    for (let i = 0; i < n; i++) s += PIECES[Math.floor(rnd() * PIECES.length)]! + (rnd() < 0.5 ? ' ' : '');
    return s;
  };
}

/**
 * Flags with random names and descriptions; about a third are deprecated with
 * a random message and a fifth have a team maintainer with a random name.
 * Each has a go alias, so the fuzz exercises doc text, not naming.
 */
function fuzzFlags(): Flag[] {
  const text = fuzzText(1);
  return Array.from({ length: FUZZ_FLAGS }, (_, i) => {
    const key = `fuzz-${String(i).padStart(4, '0')}`;
    const flag = modelFlag(key, { name: text(), description: text(), aliases: { go: `Fuzz${i}` } });
    const roll = (i * 7919) % 10;
    if (roll < 3) Object.assign(flag, { deprecated: true, deprecationMessage: text() });
    if (roll >= 8) flag.maintainer = { kind: 'team', key: 'team', name: text() };
    return flag;
  });
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
    const tags = TAGS[file] ?? [];

    // `go fmt` runs the toolchain's gofmt, so this is Go 1.25's formatter too.
    const gofmt = await run('go', ['run', 'cmd/gofmt', '-l', '.']);
    expect(gofmt.output).toBe('');
    expect(gofmt.ok).toBe(true);

    const vet = await run('go', ['vet', ...tags, './...']);
    expect(vet.output).toBe('');
    expect(vet.ok).toBe(true);

    const staticcheck = await run('staticcheck', ['-checks', 'all', ...tags, './...']);
    if (file === 'doc-comments.go') {
      // deprecated.go calls LegacyCart, its three variants and KeyLegacyCart:
      // one SA1019 each, and nothing reported in the generated package.
      const reports = staticcheck.output.trim().split('\n');
      expect(reports, staticcheck.output).toHaveLength(5);
      for (const report of reports) expect(report).toMatch(/^deprecated\.go:\d+:\d+: .*\(SA1019\)$/);
      expect(reports.map((r) => / (?:f|ldflags)\.(\w+) is deprecated: /.exec(r)?.[1]).sort()).toEqual([
        'KeyLegacyCart',
        'LegacyCart',
        'LegacyCartCtx',
        'LegacyCartDetail',
        'LegacyCartDetailCtx',
      ]);
    } else {
      expect(staticcheck.output).toBe('');
      expect(staticcheck.ok).toBe(true);
    }
  });

  it(`leaves gofmt silent on ${FUZZ_FLAGS} random flag names and descriptions through the emitter`, async () => {
    const [file] = goEmitter.emit({ projectKey: 'my-project', flags: fuzzFlags() }, FUZZ_CONFIG, { generatorVersion: '0.0.0' });
    await writeFile(GENERATED, file!.contents);
    const gofmt = await run('go', ['run', 'cmd/gofmt', '-l', '.']);
    if (gofmt.output !== '') {
      const diff = await run('go', ['run', 'cmd/gofmt', '-d', '.']);
      expect.fail(diff.output.split('\n').slice(0, 80).join('\n'));
    }
    expect(gofmt.ok).toBe(true);
  });
});
