#!/usr/bin/env node
/**
 * Decides which CI jobs a change needs. Reads changed paths (one per line) on
 * stdin and prints the plan as JSON; under GitHub Actions it also writes each
 * field to $GITHUB_OUTPUT. `--all` ignores stdin and plans every job.
 *
 *   git diff --name-only origin/main... | node scripts/ci-plan.mjs
 *
 * A path no rule below knows about runs everything, so a new kind of file
 * errs on the side of running too much.
 */
import { existsSync, readdirSync, readFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Built-in targets: every packages/emit-<target>. */
export function listTargets(root = REPO_ROOT) {
  return readdirSync(join(root, 'packages'))
    .filter((name) => name.startsWith('emit-'))
    .map((name) => name.slice('emit-'.length))
    .sort();
}

/** Targets with a compile test project in fixtures/compile/<target>. */
export function listCompileTargets(targets, root = REPO_ROOT) {
  return targets.filter((t) => existsSync(join(root, 'fixtures/compile', t)));
}

/** Paths that cannot change what any test sees. */
const IGNORED = [
  /^docs\//,
  /^prototypes\//,
  /^\.claude\//,
  /^\.agents\//,
  /^skills-lock\.json$/,
  /^LICENSE$/,
  // Workflows other than ci.yml do not run tests.
  /^\.github\/workflows\/(?!ci\.yml$)/,
];

/**
 * @param {string[]} files changed paths, relative to the repo root
 * @param {string[]} targets built-in targets
 * @param {string[]} compileTargets the targets that have compile tests
 * @returns {{ unit: string[] | 'all', compile: string[], pack: boolean }}
 *   `unit` is the vitest path filters for `pnpm test` (`'all'` for no filter),
 *   `compile` the targets whose compile tests run, `pack` whether the smoke test runs.
 */
export function plan(files, targets, compileTargets = targets) {
  const unit = new Set();
  const compile = new Set();
  let pack = false;
  let all = false;

  const target = (t) => {
    unit.add(`packages/emit-${t}/`);
    // The CLI's golden tests run every emitter.
    unit.add('packages/cli/');
    if (compileTargets.includes(t)) compile.add(t);
  };

  for (const file of files) {
    let m;
    if (file === 'DESIGN.md') {
      // packages/cli/test/target-options-doc.test.ts checks its Target options table.
      unit.add('packages/cli/');
    } else if (file.endsWith('.md') || IGNORED.some((re) => re.test(file))) {
      // Docs only.
    } else if (file.startsWith('packages/core/')) {
      all = true;
    } else if ((m = /^packages\/emit-([^/]+)\//.exec(file)) && targets.includes(m[1])) {
      target(m[1]);
      pack = true; // the packed CLI bundles every emitter
    } else if (file.startsWith('packages/cli/')) {
      unit.add('packages/cli/');
      pack = true;
    } else if ((m = /^fixtures\/golden\/([^/]+)\//.exec(file)) && targets.includes(m[1])) {
      target(m[1]);
      // The smoke test compares against a ts-server golden.
      if (m[1] === 'ts-server') pack = true;
    } else if ((m = /^fixtures\/compile\/([^/]+)\//.exec(file)) && compileTargets.includes(m[1])) {
      compile.add(m[1]);
    } else if (file.startsWith('fixtures/snapshots/')) {
      // Read by the CLI's tests, including the smoke test.
      unit.add('packages/cli/');
      pack = true;
    } else {
      all = true;
    }
  }

  if (all) return { unit: 'all', compile: [...compileTargets], pack: true };
  return { unit: [...unit].sort(), compile: [...compile].sort(), pack };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const targets = listTargets();
  const compileTargets = listCompileTargets(targets);
  const files = process.argv.includes('--all')
    ? null
    : readFileSync(0, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
  const result = files ? plan(files, targets, compileTargets) : { unit: 'all', compile: compileTargets, pack: true };

  const outputs = {
    // `pnpm test` arguments; empty means skip the job.
    unit: result.unit === 'all' ? 'all' : result.unit.join(' '),
    compile: JSON.stringify(result.compile),
    pack: String(result.pack),
  };
  console.log(JSON.stringify(result, null, 2));
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      Object.entries(outputs).map(([k, v]) => `${k}=${v}\n`).join(''),
    );
  }
}
