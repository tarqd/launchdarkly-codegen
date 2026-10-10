/** The interface every target's emitter implements (DESIGN.md → Emitters). */

import type { GeneratedFlag } from './check/flag-changes.js';
import type { FlagModel, TargetId } from './model.js';
import type { OptionDeclarations, OptionValues } from './target-options.js';

/**
 * One entry of the config's `targets` list, validated: the keys every target
 * has, and the target's own `options` as its emitter parsed them.
 */
export interface TargetConfig<O = Record<string, unknown>> {
  id: TargetId;
  /** Output path from the config, relative to the config file's directory. */
  out: string;
  sdkMajor: number;
  options: O;
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

/**
 * A target's emitter. `D` declares the target's own config keys; config
 * loading parses them (ADR 0005), so `emit` gets them typed and never fails
 * on config.
 */
export interface Emitter<D extends OptionDeclarations = OptionDeclarations> {
  id: TargetId;
  /** SDK major versions this emitter supports; config validation checks `sdkMajor` against it. */
  sdkMajors: readonly number[];
  /** The extensions `out` may end in; absent when `out` is not one file (java's is a directory). */
  outExtensions?: readonly string[];
  /** The target's own config keys; a target key that is neither one of these nor `id`, `out` or `sdkMajor` is an error. */
  options?: D;
  emit(model: FlagModel, cfg: TargetConfig<OptionValues<D>>, ctx: EmitContext): GeneratedFile[];
  /**
   * Optional: the flags in this target's output, read back from its text, or
   * `undefined` when the text doesn't look like this target's output. `check`
   * reads the file on disk and the new output with it for its one-line
   * summary (`summarizeReadBack`); without it, a stale file gets the diff alone.
   */
  readFlags?(text: string): GeneratedFlag[] | undefined;
}
