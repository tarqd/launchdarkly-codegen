// Uses the generated wrapper the way a consumer would. The compile test copies
// a golden file to ./flags.generated.ts and runs `tsc --noEmit` on this project.
import type { LDClient } from '@launchdarkly/node-server-sdk';
import { FlagKeys, Flags } from './flags.generated.js';

export function wrap(client: LDClient): Flags {
  return new Flags(client);
}

// FlagKeys maps each identifier to the raw flag key.
export const keys: Readonly<Record<string, string>> = FlagKeys;
