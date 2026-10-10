import { readFileSync } from 'node:fs';

/**
 * The generator version written into every file header. Read from this
 * package's package.json, which sits one level above both src/ and dist/.
 */
export const GENERATOR_VERSION: string = (
  JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
).version;
