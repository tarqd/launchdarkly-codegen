/**
 * Pack-and-install smoke test (DESIGN.md → Repository layout): the published
 * tarball must work on its own in a fresh project. Packs @launchtarqly/codegen,
 * installs the tarball into a scratch project with npm (no workspace in
 * sight), and runs the `launchtarqly-codegen` bin against a fixture snapshot.
 * Slow and needs the npm registry, so it runs via `pnpm test:smoke`, not
 * `pnpm test`.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { beforeAll, describe, expect, it } from 'vitest';

const exec = promisify(execFile);
// Paths are local rather than from ./helpers.js, which imports the CLI source:
// this test must exercise only the packed tarball.
const REPO_ROOT = resolve(import.meta.dirname, '../../..');
const CLI_DIR = join(REPO_ROOT, 'packages/cli');
const SNAPSHOT = join(REPO_ROOT, 'fixtures/snapshots/boolean-flags.json');
const GOLDEN = join(REPO_ROOT, 'fixtures/golden/ts-server/boolean-flags.ts');
const OUT = 'src/flags.generated.ts';

interface PackedManifest {
  name: string;
  private?: boolean;
  bin?: Record<string, string>;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

let files: string[];
let manifest: PackedManifest;
let project: string;

/** Runs the installed bin in the scratch project. */
async function bin(args: string[]) {
  try {
    const { stdout, stderr } = await exec(join(project, 'node_modules/.bin/launchtarqly-codegen'), args, {
      cwd: project,
    });
    return { exitCode: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code: number; stdout: string; stderr: string };
    return { exitCode: e.code, stdout: e.stdout, stderr: e.stderr };
  }
}

beforeAll(async () => {
  const packDir = await mkdtemp(join(tmpdir(), 'ld-codegen-pack-'));
  // pnpm pack runs the package's prepack script and rewrites workspace: ranges.
  await exec('pnpm', ['pack', '--pack-destination', packDir], { cwd: CLI_DIR });
  const tgz = (await readdir(packDir)).find((f) => f.endsWith('.tgz'));
  if (tgz === undefined) throw new Error('pnpm pack produced no tarball');
  const tarball = join(packDir, tgz);
  files = (await exec('tar', ['-tzf', tarball])).stdout.trim().split('\n').sort();
  manifest = JSON.parse((await exec('tar', ['-xzOf', tarball, 'package/package.json'])).stdout) as PackedManifest;

  project = await mkdtemp(join(tmpdir(), 'ld-codegen-scratch-'));
  await writeFile(join(project, 'package.json'), JSON.stringify({ name: 'scratch', private: true, type: 'module' }));
  await writeFile(
    join(project, 'launchdarkly-codegen.config.json'),
    JSON.stringify({ project: 'demo', targets: [{ id: 'ts-server', out: OUT, sdkMajor: 9 }] }),
  );
  await exec('npm', ['install', '--no-audit', '--no-fund', tarball], { cwd: project });
}, 180_000);

describe('the packed @launchtarqly/codegen tarball', () => {
  it('is the public CLI package with the launchtarqly-codegen bin', () => {
    expect(manifest.name).toBe('@launchtarqly/codegen');
    expect(manifest.private).toBeUndefined();
    expect(Object.keys(manifest.bin ?? {})).toEqual(['launchtarqly-codegen']);
  });

  it('has no dependency on workspace packages', () => {
    const deps = { ...manifest.dependencies, ...manifest.peerDependencies, ...manifest.optionalDependencies };
    expect(Object.keys(deps).filter((d) => d.startsWith('@launchtarqly/'))).toEqual([]);
    expect(Object.values(deps).filter((v) => v.startsWith('workspace:'))).toEqual([]);
  });

  it('contains only what the CLI needs at runtime', () => {
    expect(files).toEqual([
      'package/bundle/index.js',
      'package/bundle/launchtarqly-codegen.js',
      'package/package.json',
    ]);
  });
});

describe('installed into a fresh project', () => {
  it('generates the golden ts-server output from a snapshot', async () => {
    const result = await bin(['generate', '--from-snapshot', SNAPSHOT]);
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(await readFile(join(project, OUT), 'utf8')).toBe(
      await readFile(GOLDEN, 'utf8'),
    );
  });

  it('passes `check` right after `generate`', async () => {
    await bin(['generate', '--from-snapshot', SNAPSHOT]);
    const result = await bin(['check', '--from-snapshot', SNAPSHOT]);
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
  });
});
