/** Argument parsing and command dispatch (DESIGN.md → CLI). */

import { relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { CodegenError, readSnapshot } from '@launchtarqly/core';
import { resolveConfig } from './config.js';
import { generateFiles, writeFiles } from './generate.js';
import { writeStarterConfig } from './init.js';
import { settingOptions } from './settings.js';

export interface RunIO {
  cwd: string;
  env: Record<string, string | undefined>;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

const USAGE = `usage: launchtarqly-codegen generate [--config path] [--target id]... [--project key]
                                     [--base-uri uri] [--access-token token] [--from-snapshot file]
       launchtarqly-codegen init [--config path]
`;

/** Runs the CLI and returns its exit code: 0 ok, 1 stale, 2 error. */
export async function run(argv: string[], io: RunIO): Promise<number> {
  try {
    const [command, ...rest] = argv;
    switch (command) {
      case 'generate':
        return await generateCommand(rest, io);
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
        ...settingOptions(),
      },
    }).values;
  } catch (err) {
    throw new CodegenError((err as Error).message);
  }
}

async function generateCommand(args: string[], io: RunIO): Promise<number> {
  const opts = parse(args);
  const warn = (message: string) => io.stderr(`warning: ${message}\n`);
  const { config, dir } = await resolveConfig({ cwd: io.cwd, env: io.env, cli: opts, warn });
  const snapshotPath = opts['from-snapshot'];
  if (snapshotPath === undefined) {
    throw new CodegenError('live fetching is not implemented yet; pass --from-snapshot <file>');
  }
  const snapshot = await readSnapshot(resolve(io.cwd, snapshotPath));
  const written = await writeFiles(generateFiles(config, snapshot, { warn }), dir);
  for (const path of written) io.stdout(`wrote ${relative(io.cwd, path) || path}\n`);
  return 0;
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
