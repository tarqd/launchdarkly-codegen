/**
 * Golden tests: every snapshot in fixtures/snapshots is run through every
 * built-in emitter and compared with fixtures/golden/<target>/<snapshot>.<ext>.
 * Run with UPDATE_GOLDEN=1 to rewrite the golden files, then review the diff.
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GOLDEN_DIR, projectDir, runCli, SNAPSHOTS_DIR } from './helpers.js';

const TARGETS = [
  { id: 'ts-server', ext: '.ts', extra: { sdkMajor: 9 } },
  { id: 'go', ext: '.go', extra: { sdkMajor: 7, package: 'ldflags' } },
];

const snapshots = (await readdir(SNAPSHOTS_DIR)).filter((f) => f.endsWith('.json')).sort();

describe.each(TARGETS)('golden output for $id', ({ id, ext, extra }) => {
  it.each(snapshots)('%s', async (file) => {
    const name = basename(file, '.json');
    const snapshot = JSON.parse(await readFile(join(SNAPSHOTS_DIR, file), 'utf8')) as { projectKey: string };
    const out = `out/${name}${ext}`;
    const dir = await projectDir({ project: snapshot.projectKey, targets: [{ id, out, ...extra }] });

    const result = await runCli(['generate', '--from-snapshot', join(SNAPSHOTS_DIR, file)], dir);
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);

    const actual = await readFile(join(dir, out), 'utf8');
    const goldenPath = join(GOLDEN_DIR, id, `${name}${ext}`);
    if (process.env.UPDATE_GOLDEN) {
      await mkdir(dirname(goldenPath), { recursive: true });
      await writeFile(goldenPath, actual);
    }
    expect(actual).toBe(await readFile(goldenPath, 'utf8'));
  });
});
