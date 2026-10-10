/** Argument parsing and command dispatch (DESIGN.md → CLI). */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { CodegenError, defaultFetchDeps, fetchSnapshot, readSnapshot, type Snapshot } from '@launchtarqly/core';
import { checkFiles } from './check.js';
import { resolveConfig, type Config } from './config.js';
import { generateFiles, writeFiles } from './generate.js';
import { writeStarterConfig } from './init.js';
import { settingOptions } from './settings.js';

export interface RunIO {
  cwd: string;
  env: Record<string, string | undefined>;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  /** HTTP transport for the live fetcher; defaults to the global `fetch`. */
  fetch?: (input: string, init?: RequestInit) => Promise<Response>;
}

const USAGE = `usage: launchtarqly-codegen generate [--config path] [--target id]... [--project key] [--tag t]...
                                     [--base-uri uri] [--access-token token] [--from-snapshot file]
       launchtarqly-codegen check    [same flags as generate]   exit 1 if any target is stale
       launchtarqly-codegen snapshot --write-snapshot file [--config path] [--project key]
                                     [--tag t]... [--base-uri uri] [--access-token token]
       launchtarqly-codegen init [--config path]
`;

/** Runs the CLI and returns its exit code: 0 ok, 1 stale, 2 error. */
export async function run(argv: string[], io: RunIO): Promise<number> {
  try {
    const [command, ...rest] = argv;
    switch (command) {
      case 'generate':
        return await generateCommand(rest, io);
      case 'check':
        return await checkCommand(rest, io);
      case 'snapshot':
        return await snapshotCommand(rest, io);
      case 'init':
        return await initCommand(rest, io);
      case undefined:
      case '--help':
      case '-h':
        io.stdout(USAGE);
        return command === undefined ? 2 : 0;
      default:
        throw new CodegenError(`unknown command \`${command}\`\n${USAGE}`);
    }
  } catch (err) {
    if (err instanceof CodegenError) {
      io.stderr(`error: ${err.message}\n`);
      return err.exitCode;
    }
    throw err;
  }
}

function parse(args: string[]) {
  try {
    return parseArgs({
      args,
      strict: true,
      options: {
        config: { type: 'string' },
        target: { type: 'string', multiple: true },
        'from-snapshot': { type: 'string' },
        'write-snapshot': { type: 'string' },
        ...settingOptions(),
      },
    }).values;
  } catch (err) {
    throw new CodegenError((err as Error).message);
  }
}

/** Config and snapshot for `generate` and `check`, which take the same flags. */
async function loadInputs(args: string[], io: RunIO) {
  const opts = parse(args);
  const warn = (message: string) => io.stderr(`warning: ${message}\n`);
  const { config, dir } = await resolveConfig({ cwd: io.cwd, env: io.env, cli: opts, warn });
  const snapshotPath = opts['from-snapshot'];
  const snapshot =
    snapshotPath === undefined ? await fetchLive(config, io) : await readSnapshot(resolve(io.cwd, snapshotPath));
  return { config, dir, snapshot, warn };
}

async function generateCommand(args: string[], io: RunIO): Promise<number> {
  const { config, dir, snapshot, warn } = await loadInputs(args, io);
  const written = await writeFiles(generateFiles(config, snapshot, { warn }), dir);
  for (const path of written) io.stdout(`wrote ${relative(io.cwd, path) || path}\n`);
  return 0;
}

async function checkCommand(args: string[], io: RunIO): Promise<number> {
  // Config, fetch and model errors (exit 2) all happen inside loadInputs and
  // checkFiles' generation step, before any file is compared, so an API
  // failure can never be reported as drift.
  const { config, dir, snapshot, warn } = await loadInputs(args, io);
  const result = await checkFiles(config, snapshot, dir, { warn });
  io.stdout(result.report);
  return result.stale ? 1 : 0;
}

/** `snapshot --write-snapshot <file>`: fetch live and save the raw responses. */
async function snapshotCommand(args: string[], io: RunIO): Promise<number> {
  const opts = parse(args);
  const out = opts['write-snapshot'];
  if (out === undefined) throw new CodegenError(`snapshot needs --write-snapshot <file>\n${USAGE}`);
  const warn = (message: string) => io.stderr(`warning: ${message}\n`);
  const { config } = await resolveConfig({ cwd: io.cwd, env: io.env, cli: opts, warn });
  const snapshot = await fetchLive(config, io);
  const path = resolve(io.cwd, out);
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(snapshot, null, 2)}\n`);
  } catch (err) {
    throw new CodegenError(`cannot write snapshot ${path}: ${(err as Error).message}`);
  }
  io.stdout(`wrote ${relative(io.cwd, path) || path}\n`);
  return 0;
}

/** Fetches the flags list with the resolved connection settings. */
function fetchLive(config: Config, io: RunIO): Promise<Snapshot> {
  const { project, baseUri, accessToken, tags } = config;
  if (accessToken === undefined) {
    throw new CodegenError(
      'no LaunchDarkly access token: pass --access-token or set LD_ACCESS_TOKEN (or use --from-snapshot <file>)',
    );
  }
  return fetchSnapshot(
    { projectKey: project, baseUri, accessToken, ...(tags && { tags }) },
    io.fetch ? { ...defaultFetchDeps, fetch: io.fetch } : defaultFetchDeps,
  );
}

async function initCommand(args: string[], io: RunIO): Promise<number> {
  let opts: { config?: string };
  try {
    opts = parseArgs({ args, strict: true, options: { config: { type: 'string' } } }).values;
  } catch (err) {
    throw new CodegenError((err as Error).message);
  }
  const path = await writeStarterConfig(io.cwd, opts.config);
  io.stdout(`wrote ${relative(io.cwd, path) || path}\n`);
  return 0;
}
