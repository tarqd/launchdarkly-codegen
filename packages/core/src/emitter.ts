/** The interface every target's emitter implements (DESIGN.md → Emitters). */

import type { GeneratedFlag } from './check/flag-changes.js';
import type { FlagModel, TargetId } from './model.js';

/** One entry of the config's `targets` list. Emitters read their own extra keys. */
export interface TargetConfig {
  id: TargetId;
  /** Output path from the config, relative to the config file's directory. */
  out: string;
  sdkMajor: number;
  [option: string]: unknown;
}

/** Facts about this generator run that go into every file's header. */
export interface EmitContext {
  generatorVersion: string;
}

export interface GeneratedFile {
  /** Where to write, relative to the config file's directory. */
  path: string;
  /** Canonical text; `check` compares these bytes. */
  contents: string;
}

export interface Emitter {
  id: TargetId;
  /** SDK major versions this emitter supports; config validation checks `sdkMajor` against it. */
  sdkMajors: readonly number[];
  emit(model: FlagModel, cfg: TargetConfig, ctx: EmitContext): GeneratedFile[];
  /**
   * Optional: the flags in this target's output, read back from its text, or
   * `undefined` when the text doesn't look like this target's output. `check`
   * reads the file on disk and the new output with it for its one-line
   * summary (`summarizeReadBack`); without it, a stale file gets the diff alone.
   */
  readFlags?(text: string): GeneratedFlag[] | undefined;
}
