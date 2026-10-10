/**
 * Compile test: each golden java file is dropped into fixtures/compile/java
 * (a Maven project pinned to launchdarkly-java-server-sdk 7.17.2) and must
 * pass three checks with no output (DESIGN.md → java → Compile fixture):
 * `mvn compile` at --release 8 with -Xlint:all,-options -Xdoclint:all
 * -Werror, `javadoc -Xdoclint:all -Werror`, and google-java-format 1.37.0
 * `--dry-run --set-exit-if-changed`. A golden file with a directory under
 * usage/ also gets that directory's consumer code, which calls its methods.
 * Needs JDK 21 and `mvn` on the PATH. Run with `pnpm test:compile`.
 */
import { execFile } from 'node:child_process';
import { access, copyFile, mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { beforeAll, describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '../../..');
const GOLDEN_DIR = join(REPO_ROOT, 'fixtures/golden/java');
const PROJECT_DIR = join(REPO_ROOT, 'fixtures/compile/java');
const USAGE_DIR = join(PROJECT_DIR, 'usage');
const FLAGS_DIR = join(PROJECT_DIR, 'src/main/java/com/example/flags');
const USAGE_SRC_DIR = join(PROJECT_DIR, 'src/main/java/com/example/usage');

const GJF_VERSION = '1.37.0';
const GJF_JAR =
  process.env.GOOGLE_JAVA_FORMAT_JAR ??
  join(homedir(), '.cache/google-java-format', `google-java-format-${GJF_VERSION}-all-deps.jar`);
const GJF_URL = `https://github.com/google/google-java-format/releases/download/v${GJF_VERSION}/google-java-format-${GJF_VERSION}-all-deps.jar`;

interface RunResult {
  ok: boolean;
  output: string;
}

/** The JVM announces JAVA_TOOL_OPTIONS on stderr; that is the environment talking, not the check. */
const JVM_NOTICE = /^(NOTE: )?Picked up (JAVA_TOOL_OPTIONS|_JAVA_OPTIONS|JDK_JAVA_OPTIONS):.*\n?/gm;

async function run(file: string, args: string[]): Promise<RunResult> {
  return promisify(execFile)(file, args, { cwd: PROJECT_DIR, maxBuffer: 16 * 1024 * 1024 }).then(
    ({ stdout, stderr }) => ({ ok: true, output: `${stdout}${stderr}`.replace(JVM_NOTICE, '') }),
    (err: { stdout?: string; stderr?: string; message: string }) => ({
      ok: false,
      output: `${err.stdout ?? ''}${err.stderr ?? ''}`.replace(JVM_NOTICE, '') || err.message,
    }),
  );
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

const goldens = (await readdir(GOLDEN_DIR)).filter((f) => f.endsWith('.java')).sort();

describe('java golden output compiles against java-server-sdk 7.17.2', () => {
  let classpath = '';

  beforeAll(async () => {
    if (!(await exists(GJF_JAR))) {
      await mkdir(resolve(GJF_JAR, '..'), { recursive: true });
      const download = await run('curl', ['-fsSL', '-o', GJF_JAR, GJF_URL]);
      if (!download.ok) throw new Error(`cannot download google-java-format: ${download.output}`);
    }
    const cpFile = join(await mkdtemp(join(tmpdir(), 'ld-codegen-java-')), 'classpath.txt');
    const cp = await run('mvn', ['-q', '-B', 'dependency:build-classpath', `-Dmdep.outputFile=${cpFile}`]);
    if (!cp.ok) throw new Error(`mvn dependency:build-classpath failed: ${cp.output}`);
    classpath = (await readFile(cpFile, 'utf8')).trim();
  }, 600_000);

  it.each(goldens)('%s', async (file) => {
    await rm(FLAGS_DIR, { recursive: true, force: true });
    await rm(USAGE_SRC_DIR, { recursive: true, force: true });
    await mkdir(FLAGS_DIR, { recursive: true });
    const flagsFile = join(FLAGS_DIR, 'Flags.java');
    await copyFile(join(GOLDEN_DIR, file), flagsFile);
    const usage = join(USAGE_DIR, basename(file, '.java'));
    if (await exists(usage)) {
      await mkdir(USAGE_SRC_DIR, { recursive: true });
      for (const source of await readdir(usage)) await copyFile(join(usage, source), join(USAGE_SRC_DIR, source));
    }

    const compile = await run('mvn', ['-q', '-B', 'clean', 'compile']);
    expect(compile.output).toBe('');
    expect(compile.ok).toBe(true);

    const docDir = await mkdtemp(join(tmpdir(), 'ld-codegen-javadoc-'));
    const javadoc = await run('javadoc', ['-quiet', '-Xdoclint:all', '-Werror', '-d', docDir, '-cp', classpath, flagsFile]);
    expect(javadoc.output).toBe('');
    expect(javadoc.ok).toBe(true);

    const format = await run('java', ['-jar', GJF_JAR, '--dry-run', '--set-exit-if-changed', flagsFile]);
    expect(format.output).toBe('');
    expect(format.ok).toBe(true);
  });
});
