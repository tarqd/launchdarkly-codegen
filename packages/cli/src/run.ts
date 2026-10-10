/** Argument parsing and command dispatch (DESIGN.md → CLI). */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { CodegenError, defaultFetchDeps, fetchSnapshot, readSnapshot, type Snapshot } from '@launchtarqly/core';
import { loadConfig, type Config } from './config.js';
import { resolveConnection } from './connection.js';
import { generateFiles, writeFiles } from './generate.js';

export interface RunIO {
  cwd: string;
  env: Record<string, string | undefined>;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  /** HTTP transport for the live fetcher; defaults to the global `fetch`. */
  fetch?: (input: string, init?: RequestInit) => Promise<Response>;
}

const USAGE = `usage: launchtarqly-codegen generate [--config path] [--base-uri uri] [--access-token token] [--from-snapshot file]
       launchtarqly-codegen snapshot --write-snapshot file [--config path] [--base-uri uri] [--access-token token]
`;

/** Runs the CLI and returns its exit code: 0 ok, 1 stale, 2 error. */
export async function run(argv: string[], io: RunIO): Promise<number> {
  try {
    const [command, ...rest] = argv;
    switch (command) {
      case 'generate':
        return await generateCommand(rest, io);
      case 'snapshot':
        return await snapshotCommand(rest, io);
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
        'from-snapshot': { type: 'string' },
        'write-snapshot': { type: 'string' },
        'base-uri': { type: 'string' },
        'access-token': { type: 'string' },
      },
    }).values;
  } catch (err) {
    throw new CodegenError((err as Error).message);
  }
}

async function generateCommand(args: string[], io: RunIO): Promise<number> {
  const opts = parse(args);
  const { config, dir } = await loadConfig(io.cwd, opts.config);
  const snapshotPath = opts['from-snapshot'];
  const snapshot =
    snapshotPath === undefined ? await fetchLive(opts, config, io) : await readSnapshot(resolve(io.cwd, snapshotPath));
  const written = await writeFiles(generateFiles(config, snapshot), dir);
  for (const path of written) io.stdout(`wrote ${relative(io.cwd, path) || path}\n`);
  return 0;
}

/** `snapshot --write-snapshot <file>`: fetch live and save the raw responses. */
async function snapshotCommand(args: string[], io: RunIO): Promise<number> {
  const opts = parse(args);
  const out = opts['write-snapshot'];
  if (out === undefined) throw new CodegenError(`snapshot needs --write-snapshot <file>\n${USAGE}`);
  const { config } = await loadConfig(io.cwd, opts.config);
  const snapshot = await fetchLive(opts, config, io);
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

function fetchLive(opts: ReturnType<typeof parse>, config: Config, io: RunIO): Promise<Snapshot> {
  const connection = resolveConnection(
    { baseUri: opts['base-uri'], accessToken: opts['access-token'] },
    io.env,
    config,
  );
  return fetchSnapshot(
    { projectKey: config.project, ...connection },
    io.fetch ? { ...defaultFetchDeps, fetch: io.fetch } : defaultFetchDeps,
  );
}
