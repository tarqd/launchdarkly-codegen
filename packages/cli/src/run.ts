/** Argument parsing and command dispatch (DESIGN.md → CLI). */

import { relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { CodegenError, readSnapshot } from '@launchtarqly/core';
import { loadConfig } from './config.js';
import { generateFiles, writeFiles } from './generate.js';
import { checkFiles } from './check.js';

export interface RunIO {
  cwd: string;
  env: Record<string, string | undefined>;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

const USAGE = `usage: launchtarqly-codegen generate [--config path] [--from-snapshot file]
       launchtarqly-codegen check    [same flags]      exit 1 if any target is stale
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
      },
    }).values;
  } catch (err) {
    throw new CodegenError((err as Error).message);
  }
}

/** Config and snapshot for `generate` and `check`, which take the same flags. */
async function loadInputs(args: string[], io: RunIO) {
  const opts = parse(args);
  const { config, dir } = await loadConfig(io.cwd, opts.config);
  const snapshotPath = opts['from-snapshot'];
  if (snapshotPath === undefined) {
    throw new CodegenError('live fetching is not implemented yet; pass --from-snapshot <file>');
  }
  const snapshot = await readSnapshot(resolve(io.cwd, snapshotPath));
  const warn = (message: string) => io.stderr(`warning: ${message}\n`);
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
