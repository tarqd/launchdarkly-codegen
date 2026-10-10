import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { projectDir, runCli, SNAPSHOTS_DIR } from './helpers.js';

const snapshot = join(SNAPSHOTS_DIR, 'flag-kinds.json');
const javaTarget = { id: 'java', out: 'src/main/java/com/example/flags', package: 'com.example.flags', sdkMajor: 7 };
const configWith = (target: Record<string, unknown>) => ({ project: 'my-project', targets: [target] });
const generate = (dir: string) => runCli(['generate', '--from-snapshot', snapshot], dir);

describe('java target', () => {
  it('writes Flags.java into the out directory', async () => {
    const dir = await projectDir(configWith(javaTarget));
    const result = await generate(dir);
    expect(result).toMatchObject({ exitCode: 0, stderr: '' });
    const text = await readFile(join(dir, 'src/main/java/com/example/flags/Flags.java'), 'utf8');
    expect(text).toContain('package com.example.flags;\n');
    expect(text).toContain('public final class Flags {');
  });

  it('rejects an sdkMajor other than 7', async () => {
    const dir = await projectDir(configWith({ ...javaTarget, sdkMajor: 6 }));
    const result = await generate(dir);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/targets\[0\]\.sdkMajor: java does not support 6 \(supported: 7\)/);
  });

  it('exits 2 naming `package` when it is missing', async () => {
    const { package: _omitted, ...withoutPackage } = javaTarget;
    const dir = await projectDir(configWith(withoutPackage));
    const result = await generate(dir);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/java target: `package` is required/);
  });

  it.each([
    ['a non-string', 42],
    ['an empty string', ''],
    ['an empty segment', 'com..flags'],
    ['a trailing dot', 'com.example.'],
    ['a segment starting with a digit', 'com.1example'],
    ['a hyphen', 'com.my-company.flags'],
    ['a reserved word', 'com.example.int'],
    ['a literal', 'com.true.flags'],
    ['a lone underscore', 'com._.flags'],
  ])('exits 2 naming `package` for %s', async (_case, pkg) => {
    const dir = await projectDir(configWith({ ...javaTarget, package: pkg }));
    const result = await generate(dir);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/java target: `package` /);
  });

  it('accepts identifiers with $ and _', async () => {
    const dir = await projectDir(configWith({ ...javaTarget, package: 'com.$gen._flags', out: 'gen' }));
    const result = await generate(dir);
    expect(result).toMatchObject({ exitCode: 0, stderr: '' });
    await expect(readFile(join(dir, 'gen/Flags.java'), 'utf8')).resolves.toContain('package com.$gen._flags;\n');
  });
});
