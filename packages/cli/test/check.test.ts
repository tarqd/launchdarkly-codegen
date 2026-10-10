import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GENERATOR_VERSION } from '../src/index.js';
import { projectDir, runCli, SNAPSHOTS_DIR } from './helpers.js';

const snapshot = join(SNAPSHOTS_DIR, 'boolean-flags.json');
const OUT = 'src/flags.generated.ts';
const minimalConfig = {
  project: 'my-project',
  targets: [{ id: 'ts-server', out: OUT, sdkMajor: 9 }],
};

/** A project dir whose committed output is exactly what `generate` writes now. */
async function generatedProject(config: unknown = minimalConfig): Promise<string> {
  const dir = await projectDir(config);
  const result = await runCli(['generate', '--from-snapshot', snapshot], dir);
  expect(result.exitCode).toBe(0);
  return dir;
}

describe('check --from-snapshot', () => {
  it('exits 0 when the committed output matches', async () => {
    const dir = await generatedProject();
    const result = await runCli(['check', '--from-snapshot', snapshot], dir);
    expect(result).toMatchObject({ exitCode: 0, stderr: '' });
  });

  it('exits 1 with a unified diff when any byte differs', async () => {
    const dir = await generatedProject();
    const path = join(dir, OUT);
    const committed = await readFile(path, 'utf8');
    // A generator upgrade with unchanged flags only changes the header.
    await writeFile(path, committed.replace(`generator: ${GENERATOR_VERSION}`, 'generator: 0.0.0-old'));
    const result = await runCli(['check', '--from-snapshot', snapshot], dir);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(`--- a/${OUT}\n+++ b/${OUT}\n@@ -1,5 +1,5 @@\n`);
    expect(result.stdout).toContain(`-// project: my-project   generator: 0.0.0-old\n+// project: my-project   generator: ${GENERATOR_VERSION}\n`);
  });

  it('treats a trailing-whitespace-only difference as stale', async () => {
    const dir = await generatedProject();
    const path = join(dir, OUT);
    await writeFile(path, `${await readFile(path, 'utf8')}\n`);
    const result = await runCli(['check', '--from-snapshot', snapshot], dir);
    expect(result.exitCode).toBe(1);
  });

  it('takes the same --config and --target flags as generate', async () => {
    const dir = await projectDir({ project: 'p', targets: [{ id: 'ts-server', out: 'unused.ts', sdkMajor: 9 }] });
    await writeFile(join(dir, 'other.json'), JSON.stringify(minimalConfig));
    const args = ['--config', 'other.json', '--target', 'ts-server', '--from-snapshot', snapshot];
    expect((await runCli(['generate', ...args], dir)).exitCode).toBe(0);
    expect(await runCli(['check', ...args], dir)).toMatchObject({ exitCode: 0, stderr: '' });
    const unknown = await runCli(['check', ...args, '--target', 'go'], dir);
    expect(unknown.exitCode).toBe(2);
    expect(unknown.stderr).toContain('--target go');
  });

  describe('the flag summary', () => {
    it('follows the diff of a stale ts-server file', async () => {
      const dir = await generatedProject();
      const path = join(dir, OUT);
      // As if the committed file predates a rename of checkout-v2's identifier and the removal of a flag.
      const committed = (await readFile(path, 'utf8'))
        .replaceAll('checkoutV2', 'checkoutVersion2')
        .replace("} as const;", "  zombie: 'zombie',\n} as const;")
        .replace(
          '\n}\n\nexport const FlagKeys',
          "\n\n  zombie(context: LDContext, fallback: boolean): Promise<boolean> {\n    return this.client.boolVariation('zombie', context, fallback);\n  }\n}\n\nexport const FlagKeys",
        );
      await writeFile(path, committed);
      const result = await runCli(['check', '--from-snapshot', snapshot], dir);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toMatch(/\n@@ [\s\S]*\nflags: 1 removed \(zombie\), 1 renamed \(checkout-v2: checkoutVersion2 → checkoutV2\)\n$/);
    });

    it('is left out when the existing file cannot be parsed, but the diff is still printed', async () => {
      const dir = await generatedProject();
      await writeFile(join(dir, OUT), 'hand-edited nonsense\n');
      const result = await runCli(['check', '--from-snapshot', snapshot], dir);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain('-hand-edited nonsense\n');
      expect(result.stdout).not.toContain('flags:');
    });
  });

  describe('the flag summary for java', () => {
    const JAVA_OUT = 'src/main/java/com/example/flags/Flags.java';
    const javaConfig = {
      project: 'my-project',
      targets: [{ id: 'java', out: 'src/main/java/com/example/flags', package: 'com.example.flags', sdkMajor: 7 }],
    };

    it('follows the diff of a stale Flags.java', async () => {
      const dir = await generatedProject(javaConfig);
      const path = join(dir, JAVA_OUT);
      // As if the committed file predates an alias for checkout-v2.
      const old = (await readFile(path, 'utf8')).replaceAll('checkoutV2', 'checkoutVersion2');
      await writeFile(path, old.replaceAll('CHECKOUT_V2', 'CHECKOUT_VERSION_2'));
      const result = await runCli(['check', '--from-snapshot', snapshot], dir);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toMatch(/\n@@ [\s\S]*\nflags: 1 renamed \(checkout-v2: checkoutVersion2 → checkoutV2\)\n$/);
    });

    it('is left out for a hand-mangled Flags.java, but the diff is still printed', async () => {
      const dir = await generatedProject(javaConfig);
      const path = join(dir, JAVA_OUT);
      await writeFile(path, (await readFile(path, 'utf8')).replace('private Keys() {}', 'private Keys() { throw null; }'));
      const result = await runCli(['check', '--from-snapshot', snapshot], dir);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain('+    private Keys() {}\n');
      expect(result.stdout).not.toContain('flags:');
    });
  });

  describe('a missing output file', () => {
    it('is stale by default, diffed against /dev/null, and is not created', async () => {
      const dir = await projectDir(minimalConfig);
      const result = await runCli(['check', '--from-snapshot', snapshot], dir);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain(`--- /dev/null\n+++ b/${OUT}\n@@ -0,0 +1,`);
      expect(await readdir(dir)).toEqual(['launchdarkly-codegen.config.json']);
    });

    it('is stale with check.failOnMissingOutput: true', async () => {
      const dir = await projectDir({ ...minimalConfig, check: { failOnMissingOutput: true } });
      const result = await runCli(['check', '--from-snapshot', snapshot], dir);
      expect(result.exitCode).toBe(1);
    });

    it('is skipped with check.failOnMissingOutput: false', async () => {
      const config = {
        project: 'my-project',
        targets: [
          { id: 'ts-server', out: 'present.ts', sdkMajor: 9 },
          { id: 'ts-server', out: 'missing.ts', sdkMajor: 9 },
        ],
        check: { failOnMissingOutput: false },
      };
      const dir = await generatedProject(config);
      await rm(join(dir, 'missing.ts'));
      const result = await runCli(['check', '--from-snapshot', snapshot], dir);
      expect(result).toMatchObject({ exitCode: 0, stderr: '' });
      expect(await readdir(dir)).not.toContain('missing.ts');
    });

    it('still checks the files that are present when failOnMissingOutput is false', async () => {
      const config = {
        project: 'my-project',
        targets: [
          { id: 'ts-server', out: 'present.ts', sdkMajor: 9 },
          { id: 'ts-server', out: 'missing.ts', sdkMajor: 9 },
        ],
        check: { failOnMissingOutput: false },
      };
      const dir = await generatedProject(config);
      await rm(join(dir, 'missing.ts'));
      await writeFile(join(dir, 'present.ts'), 'stale\n');
      const result = await runCli(['check', '--from-snapshot', snapshot], dir);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain('+++ b/present.ts');
      expect(result.stdout).not.toContain('missing.ts');
    });

    it('rejects a non-boolean failOnMissingOutput with exit 2', async () => {
      const dir = await projectDir({ ...minimalConfig, check: { failOnMissingOutput: 'yes' } });
      const result = await runCli(['check', '--from-snapshot', snapshot], dir);
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain('failOnMissingOutput');
    });
  });

  describe('when the flags cannot be loaded', () => {
    // Live fetch is not wired up yet; a broken snapshot is the same seam (the
    // fetcher produces a Snapshot or throws CodegenError).
    it('exits 2 and reports no drift when the API response is unusable', async () => {
      const dir = await generatedProject();
      await writeFile(join(dir, OUT), 'stale\n');
      const broken = join(dir, 'broken.json');
      await writeFile(broken, '{"snapshotVersion": 1, "projectKey": "my-project"');
      const result = await runCli(['check', '--from-snapshot', broken], dir);
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe('');
      expect(result.stderr).toMatch(/^error: /);
    });

    it('exits 2 and reports no drift on a network failure during a live fetch', async () => {
      const dir = await generatedProject();
      await writeFile(join(dir, OUT), 'stale\n');
      const fetch = async (): Promise<Response> => {
        throw new TypeError('fetch failed');
      };
      const result = await runCli(['check'], dir, { env: { LD_ACCESS_TOKEN: 'api-test' }, fetch });
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe('');
      expect(await readFile(join(dir, OUT), 'utf8')).toBe('stale\n');
    });

    it('exits 2 and reports no drift when the API returns an error', async () => {
      const dir = await generatedProject();
      await writeFile(join(dir, OUT), 'stale\n');
      const fetch = async (): Promise<Response> =>
        new Response(JSON.stringify({ code: 'unauthorized', message: 'Invalid access token' }), { status: 401 });
      const result = await runCli(['check'], dir, { env: { LD_ACCESS_TOKEN: 'api-test' }, fetch });
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe('');
    });

    it('exits 2 and reports no drift when the snapshot cannot be read', async () => {
      const dir = await projectDir(minimalConfig);
      const result = await runCli(['check', '--from-snapshot', join(dir, 'nope.json')], dir);
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe('');
    });

    it('exits 2 on a model error even though the output is missing', async () => {
      const dir = await projectDir({ ...minimalConfig, targets: [{ id: 'ts-server', out: OUT, sdkMajor: 8 }] });
      const result = await runCli(['check', '--from-snapshot', snapshot], dir);
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe('');
    });

    it('generates every target before comparing any file', async () => {
      const dir = await generatedProject();
      await writeFile(join(dir, OUT), 'stale\n');
      const config = { ...minimalConfig, targets: [...minimalConfig.targets, { id: 'ts-server', out: 'b.ts', sdkMajor: 8 }] };
      await writeFile(join(dir, 'launchdarkly-codegen.config.json'), JSON.stringify(config));
      const result = await runCli(['check', '--from-snapshot', snapshot], dir);
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe('');
    });
  });

  it('does not touch a stale file', async () => {
    const dir = await generatedProject();
    const path = join(dir, OUT);
    await writeFile(path, 'stale\n');
    await runCli(['check', '--from-snapshot', snapshot], dir);
    expect(await readFile(path, 'utf8')).toBe('stale\n');
  });
});
