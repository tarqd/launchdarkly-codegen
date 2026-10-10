/** Small file-system helpers shared by the commands. */

import { readFile } from 'node:fs/promises';
import { CodegenError } from '@launchtarqly/core';

/**
 * The file's bytes, or `undefined` if it does not exist. Any other read
 * error is exit 2, as `cannot read <what> <path>: ...`.
 */
export async function readIfExists(path: string, what: string): Promise<Buffer | undefined> {
  try {
    return await readFile(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw new CodegenError(`cannot read ${what} ${path}: ${(err as Error).message}`);
  }
}
