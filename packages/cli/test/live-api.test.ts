/**
 * Opt-in: runs against the real LaunchDarkly API only when LD_ACCESS_TOKEN
 * is set. LD_PROJECT_KEY picks the project (default `default`), and
 * LD_BASE_URI the instance. Live and replayed runs must have the same
 * outcome: the same bytes, or (for a project the normalizer can't handle yet)
 * the same error.
 *
 *   LD_ACCESS_TOKEN=api-... LD_PROJECT_KEY=my-project pnpm vitest run packages/cli/test/live-api.test.ts
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { projectDir, runCli } from './helpers.js';

const token = process.env.LD_ACCESS_TOKEN;
const env = { LD_ACCESS_TOKEN: token, LD_BASE_URI: process.env.LD_BASE_URI };
const config = {
  project: process.env.LD_PROJECT_KEY || 'default',
  targets: [{ id: 'ts-server', out: 'flags.ts', sdkMajor: 9 }],
};

describe.skipIf(!token)('live LaunchDarkly API (LD_ACCESS_TOKEN set)', () => {
  it('snapshot then generate --from-snapshot matches a live generate', { timeout: 120_000 }, async () => {
    const dir = await projectDir(config);
    const live = await runCli(['generate'], dir, { env });

    expect(await runCli(['snapshot', '--write-snapshot', 'snap.json'], dir, { env })).toMatchObject({ exitCode: 0 });
    const snapshot = JSON.parse(await readFile(join(dir, 'snap.json'), 'utf8')) as {
      flagPages: { items: { key: string; clientSideAvailability?: unknown }[]; _links: Record<string, unknown> }[];
    };
    for (const page of snapshot.flagPages) {
      expect(page.items.length).toBeLessThanOrEqual(100);
      expect(page.items.every((f) => !('environments' in f))).toBe(true);
    }

    const replay = await projectDir(config);
    const replayed = await runCli(['generate', '--from-snapshot', join(dir, 'snap.json')], replay);
    expect({ exitCode: replayed.exitCode, stderr: replayed.stderr }).toEqual({ exitCode: live.exitCode, stderr: live.stderr });
    if (live.exitCode === 0) {
      expect(await readFile(join(replay, 'flags.ts'), 'utf8')).toBe(await readFile(join(dir, 'flags.ts'), 'utf8'));
    }
  });
});
