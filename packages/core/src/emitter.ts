/** The interface every target's emitter implements (DESIGN.md → Emitters). */

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
   * Optional: `check`'s one-line flag summary for a stale file, comparing what
   * is on disk (`oldText`) with the new output (`newText`); usually by reading
   * both back into `GeneratedFlag`s for `summarizeFlagChanges`. `undefined`
   * when either side can't be read back; the diff then stands alone.
   */
  summarizeChanges?(oldText: string, newText: string): string | undefined;
}
