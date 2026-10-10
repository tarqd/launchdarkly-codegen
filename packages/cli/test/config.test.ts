import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CodegenError } from '@launchtarqly/core';
import { CONFIG_FILENAMES, resolveConfig } from '../src/index.js';
import { projectDir, runCli, SNAPSHOTS_DIR } from './helpers.js';

const snapshot = join(SNAPSHOTS_DIR, 'boolean-flags.json');
const target = { id: 'ts-server', out: 'flags.ts', sdkMajor: 9 };
const minimal = { project: 'my-project', targets: [target] };
const generate = (dir: string, extra: string[] = [], env: Record<string, string> = {}) =>
  runCli(['generate', '--from-snapshot', snapshot, ...extra], dir, { env });

describe('config file formats', () => {
  it('loads a YAML config', async () => {
    const dir = await projectDir(
      'project: my-project\ntargets:\n  - id: ts-server\n    out: y.ts\n    sdkMajor: 9\n',
      'launchdarkly-codegen.config.yaml',
    );
    const result = await generate(dir);
    expect(result).toMatchObject({ exitCode: 0, stderr: '' });
    await expect(readFile(join(dir, 'y.ts'), 'utf8')).resolves.toContain('export class Flags');
  });

  it('loads a JS config through its default export', async () => {
    const dir = await projectDir(
      "export default { project: 'my-project', targets: [{ id: 'ts-server', out: 'j.ts', sdkMajor: 9 }] };\n",
      'launchdarkly-codegen.config.js',
    );
    const result = await generate(dir);
    expect(result).toMatchObject({ exitCode: 0, stderr: '' });
    await expect(readFile(join(dir, 'j.ts'), 'utf8')).resolves.toContain('export class Flags');
  });

  it('--config wins over the discovered file', async () => {
    const dir = await projectDir({ ...minimal, targets: [{ ...target, out: 'discovered.ts' }] });
    await writeFile(join(dir, 'other.yaml'), 'project: my-project\ntargets:\n  - { id: ts-server, out: chosen.ts, sdkMajor: 9 }\n');
    const result = await generate(dir, ['--config', 'other.yaml']);
    expect(result.exitCode).toBe(0);
    await expect(readFile(join(dir, 'chosen.ts'), 'utf8')).resolves.toContain('export class Flags');
    await expect(readFile(join(dir, 'discovered.ts'), 'utf8')).rejects.toThrow();
  });

  it('exits 2 when more than one default config file exists', async () => {
    const dir = await projectDir(minimal);
    await writeFile(join(dir, 'launchdarkly-codegen.config.yaml'), 'project: x\n');
    const result = await generate(dir);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('more than one config file');
  });
});

describe('settings precedence: CLI, then env, then file', () => {
  const fileLayer = { ...minimal, project: 'from-file', baseUri: 'https://file.example' };
  const resolve = async (cli: Record<string, string>, env: Record<string, string>) => {
    const cwd = await projectDir(fileLayer);
    return (await resolveConfig({ cwd, env, cli, warn: () => {} })).config;
  };

  it('uses the file when nothing overrides it', async () => {
    expect(await resolve({}, {})).toMatchObject({ project: 'from-file', baseUri: 'https://file.example' });
  });

  it('env beats file', async () => {
    const config = await resolve({}, { LD_CODEGEN_PROJECT: 'from-env', LD_BASE_URI: 'https://env.example' });
    expect(config).toMatchObject({ project: 'from-env', baseUri: 'https://env.example' });
  });

  it('CLI beats env', async () => {
    const config = await resolve(
      { project: 'from-cli', 'base-uri': 'https://cli.example' },
      { LD_CODEGEN_PROJECT: 'from-env', LD_BASE_URI: 'https://env.example' },
    );
    expect(config).toMatchObject({ project: 'from-cli', baseUri: 'https://cli.example' });
  });

  it('defaults baseUri to app.launchdarkly.com', async () => {
    const cwd = await projectDir(minimal);
    const { config } = await resolveConfig({ cwd, env: {}, cli: {}, warn: () => {} });
    expect(config.baseUri).toBe('https://app.launchdarkly.com');
  });

  it('a project from env satisfies a config file without one', async () => {
    const dir = await projectDir({ targets: [target] });
    const result = await generate(dir, [], { LD_CODEGEN_PROJECT: 'my-project' });
    expect(result).toMatchObject({ exitCode: 0, stderr: '' });
  });

  it('--project on the command line reaches generate', async () => {
    const dir = await projectDir({ targets: [target] });
    const result = await generate(dir, ['--project', 'my-project']);
    expect(result).toMatchObject({ exitCode: 0, stderr: '' });
  });
});

describe('validation', () => {
  const invalid: [string, unknown, RegExp][] = [
    ['an unknown target id', { ...minimal, targets: [{ ...target, id: 'cobol' }] }, /targets\[0\]\.id.*cobol/],
    ['a missing out', { ...minimal, targets: [{ id: 'ts-server', sdkMajor: 9 }] }, /targets\[0\]\.out/],
    ['an unsupported sdkMajor', { ...minimal, targets: [{ ...target, sdkMajor: 8 }] }, /targets\[0\]\.sdkMajor.*supported: 9/],
    ['a missing sdkMajor', { ...minimal, targets: [{ id: 'ts-server', out: 'x.ts' }] }, /targets\[0\]\.sdkMajor/],
    ['no targets', { project: 'p', targets: [] }, /`targets`/],
    ['a non-string project', { ...minimal, project: 42 }, /`project`/],
    ['a non-string baseUri', { ...minimal, baseUri: true }, /`baseUri`/],
    ['an unknown top-level key', { ...minimal, projcet: 'typo' }, /unknown key `projcet`/],
    ['no project anywhere', { targets: [target] }, /`project` is not set/],
  ];

  it.each(invalid)('rejects %s with exit 2, naming the key', async (_name, config, message) => {
    const dir = await projectDir(config);
    const result = await generate(dir);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(message);
    expect(result.stderr).toContain('launchdarkly-codegen.config.json');
  });

  it('rejects YAML that does not parse', async () => {
    const dir = await projectDir('project: [unclosed\n', 'launchdarkly-codegen.config.yaml');
    const result = await generate(dir);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('not valid YAML');
  });
});

describe('target options', () => {
  const goTarget = { id: 'go', out: 'flags_gen.go', sdkMajor: 7, package: 'ldflags' };
  const load = async (...targets: Record<string, unknown>[]) =>
    resolveConfig({ cwd: await projectDir({ project: 'my-project', targets }), env: {}, cli: {}, warn: () => {} });
  const loadError = async (...targets: Record<string, unknown>[]) => {
    const error = await load(...targets).then(
      () => undefined,
      (err: unknown) => err,
    );
    expect(error).toBeInstanceOf(CodegenError);
    return (error as CodegenError).message;
  };

  it("hands each target its options, parsed by the target's emitter", async () => {
    const { config } = await load(target, goTarget);
    expect(config.targets).toEqual([
      { id: 'ts-server', out: 'flags.ts', sdkMajor: 9, options: {} },
      { id: 'go', out: 'flags_gen.go', sdkMajor: 7, options: { package: 'ldflags' } },
    ]);
  });

  it('names the config file and the target position in an option error', async () => {
    const message = await loadError(target, { ...goTarget, package: 'LdFlags' });
    expect(message).toMatch(/launchdarkly-codegen\.config\.json: targets\[1\]\.package must be a lowercase Go identifier/);
  });

  it('gives a missing required option its example', async () => {
    const { package: _omitted, ...noPackage } = goTarget;
    expect(await loadError(noPackage)).toMatch(/: targets\[0\]\.package is required \(for example ldflags\)$/);
  });

  it('rejects a key that is neither common to targets nor one of its options', async () => {
    expect(await loadError({ ...goTarget, pakage: 'ldflags' })).toMatch(
      /: targets\[0\]: unknown key `pakage` for go \(known keys: id, out, sdkMajor, package\)$/,
    );
    expect(await loadError({ ...target, package: 'ldflags' })).toMatch(/: targets\[0\]: unknown key `package` for ts-server/);
  });

  it.each([
    ['ts-server', target, 'flags.js', '.ts, .mts or .cts'],
    ['go', goTarget, 'internal/ldflags/', '.go'],
    ['dotnet', { id: 'dotnet', sdkMajor: 8, namespace: 'MyApp' }, 'Flags.txt', '.cs'],
  ])("rejects a %s out that doesn't end in its extension", async (_id, t, out, extensions) => {
    expect(await loadError({ ...t, out })).toContain(`: targets[0].out must end in ${extensions}, got ${JSON.stringify(out)}`);
  });

  it.each([
    ['ts-server', target, 'flags.ts'],
    ['ts-server', target, 'flags.mts'],
    ['ts-server', target, 'flags.cts'],
    ['go', goTarget, 'internal/ldflags/flags_gen.go'],
    ['dotnet', { id: 'dotnet', sdkMajor: 8, namespace: 'MyApp' }, 'src/Flags.cs'],
    ['dotnet', { id: 'dotnet', sdkMajor: 8, namespace: 'MyApp' }, 'src/Flags.g.cs'],
  ])('accepts a %s out of %s', async (_id, t, out) => {
    await expect(load({ ...t, out })).resolves.toBeDefined();
  });

  it('accepts any java out, which is a directory', async () => {
    await expect(load({ id: 'java', out: 'src/main/java/com/example/flags', sdkMajor: 7, package: 'com.example.flags' })).resolves.toBeDefined();
  });

  it('validates every target, including those --target leaves out', async () => {
    const cwd = await projectDir({ project: 'my-project', targets: [target, { ...goTarget, package: 'type' }] });
    const run = resolveConfig({ cwd, env: {}, cli: { target: ['ts-server'] }, warn: () => {} });
    await expect(run).rejects.toThrow(/targets\[1\]\.package must be/);
  });
});

describe('--target', () => {
  const twoTargets = { ...minimal, targets: [target, { id: 'go', out: 'flags_gen.go', sdkMajor: 7, package: 'ldflags' }] };

  it('narrows the run to the named targets', async () => {
    const cwd = await projectDir(twoTargets);
    const all = await resolveConfig({ cwd, env: {}, cli: {}, warn: () => {} });
    expect(all.config.targets.map((t) => t.id)).toEqual(['ts-server', 'go']);
    const one = await resolveConfig({ cwd, env: {}, cli: { target: ['go'] }, warn: () => {} });
    expect(one.config.targets.map((t) => t.id)).toEqual(['go']);
  });

  it('generates the named target', async () => {
    const dir = await projectDir(minimal);
    const result = await generate(dir, ['--target', 'ts-server']);
    expect(result.exitCode).toBe(0);
    await expect(readFile(join(dir, 'flags.ts'), 'utf8')).resolves.toContain('export class Flags');
  });

  it('exits 2 on an id that is not configured, writing nothing', async () => {
    const dir = await projectDir(minimal);
    const result = await generate(dir, ['--target', 'ts-server', '--target', 'go']);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('--target go');
    await expect(readFile(join(dir, 'flags.ts'), 'utf8')).rejects.toThrow();
  });
});

describe('go target', () => {
  const goTarget = { id: 'go', out: 'internal/ldflags/flags_gen.go', sdkMajor: 7, package: 'ldflags' };
  const withGo = (extra: Record<string, unknown>) => ({ ...minimal, targets: [{ ...goTarget, ...extra }] });

  it('generates one Go file at out that imports only go-sdk-common', async () => {
    const dir = await projectDir(withGo({}));
    const result = await generate(dir);
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    const text = await readFile(join(dir, 'internal/ldflags/flags_gen.go'), 'utf8');
    expect(text).toContain('\npackage ldflags\n');
    const imports = text.slice(text.indexOf('import ('), text.indexOf(')\n', text.indexOf('import (')));
    expect([...imports.matchAll(/"([^"]+)"/g)].map((m) => m[1])).toEqual([
      'context',
      'github.com/launchdarkly/go-sdk-common/v3/ldcontext',
      'github.com/launchdarkly/go-sdk-common/v3/ldreason',
      'github.com/launchdarkly/go-sdk-common/v3/ldvalue',
    ]);
  });

  it.each([
    ['a missing package', { package: undefined }, 'package'],
    ['a package that is a Go keyword', { package: 'func' }, 'package'],
    ['a package with a hyphen', { package: 'ld-flags' }, 'package'],
    ['a package that is not lowercase', { package: 'LdFlags' }, 'package'],
    ['an out that is not a .go file', { out: 'internal/ldflags/' }, 'out'],
  ])('exits 2 on %s, naming the key', async (_name, extra, key) => {
    const dir = await projectDir(withGo(extra));
    const result = await generate(dir);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(new RegExp(`\\b${key}\\b`));
  });

  it('rejects an sdkMajor other than 7', async () => {
    const dir = await projectDir(withGo({ sdkMajor: 6 }));
    const result = await generate(dir);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('sdkMajor');
  });
});

describe('access token', () => {
  it('comes from LD_ACCESS_TOKEN or --access-token, CLI first', async () => {
    const cwd = await projectDir(minimal);
    const env = { LD_ACCESS_TOKEN: 'env-token' };
    expect((await resolveConfig({ cwd, env, cli: {}, warn: () => {} })).config.accessToken).toBe('env-token');
    const cli = { 'access-token': 'cli-token' };
    expect((await resolveConfig({ cwd, env, cli, warn: () => {} })).config.accessToken).toBe('cli-token');
  });

  it('is ignored in the config file, with a warning', async () => {
    const dir = await projectDir({ ...minimal, accessToken: 'api-secret' });
    const warnings: string[] = [];
    const { config } = await resolveConfig({ cwd: dir, env: {}, cli: {}, warn: (m) => warnings.push(m) });
    expect(config.accessToken).toBeUndefined();
    expect(warnings.join('\n')).toMatch(/accessToken.*ignored.*LD_ACCESS_TOKEN/);

    const result = await generate(dir);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toMatch(/^warning: .*accessToken/);
    expect(result.stderr).not.toContain('api-secret');
  });
});

describe('connection settings', () => {
  const resolveWith = async (env: Record<string, string>, cli: Record<string, unknown> = {}) =>
    (await resolveConfig({ cwd: await projectDir(minimal), env, cli, warn: () => {} })).config;

  it('treats an empty env var as unset', async () => {
    const config = await resolveWith({ LD_BASE_URI: '', LD_ACCESS_TOKEN: '' });
    expect(config.baseUri).toBe('https://app.launchdarkly.com');
    expect(config.accessToken).toBeUndefined();
  });

  it('strips trailing slashes from the base URI', async () => {
    expect((await resolveWith({ LD_BASE_URI: 'https://app.eu.launchdarkly.com//' })).baseUri).toBe(
      'https://app.eu.launchdarkly.com',
    );
  });

  it('rejects a base URI that is not an http(s) URL with exit 2', async () => {
    await expect(resolveWith({}, { 'base-uri': 'app.launchdarkly.com' })).rejects.toThrow(
      /base URI must be an http\(s\) URL/,
    );
    const result = await generate(await projectDir(minimal), ['--base-uri', 'ftp://example']);
    expect(result.exitCode).toBe(2);
  });
});

describe('init', () => {
  const emptyDir = () => mkdtemp(join(tmpdir(), 'ld-codegen-init-'));

  it('writes a starter config that generate --from-snapshot accepts', async () => {
    const dir = await emptyDir();
    const init = await runCli(['init'], dir);
    expect(init.exitCode).toBe(0);
    expect(init.stdout).toContain('launchdarkly-codegen.config.yaml');

    const result = await generate(dir);
    expect(result).toMatchObject({ exitCode: 0, stderr: '' });
    expect(result.stdout).toMatch(/wrote .*flags\.generated\.ts/);
  });

  it('writes to --config when given', async () => {
    const dir = await emptyDir();
    expect((await runCli(['init', '--config', 'cfg/codegen.yaml'], dir)).exitCode).toBe(0);
    expect((await generate(dir, ['--config', 'cfg/codegen.yaml'])).exitCode).toBe(0);
  });

  it.each(CONFIG_FILENAMES)('refuses to overwrite an existing %s', async (name) => {
    const dir = await projectDir('original', name);
    const result = await runCli(['init'], dir);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain(name);
    expect(await readFile(join(dir, name), 'utf8')).toBe('original');
  });

  it('refuses to overwrite the --config path', async () => {
    const dir = await projectDir('original', 'mine.yaml');
    const result = await runCli(['init', '--config', 'mine.yaml'], dir);
    expect(result.exitCode).toBe(2);
    expect(await readFile(join(dir, 'mine.yaml'), 'utf8')).toBe('original');
  });
});
