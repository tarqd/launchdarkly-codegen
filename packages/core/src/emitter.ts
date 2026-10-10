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
  emit(model: FlagModel, cfg: TargetConfig, ctx: EmitContext): GeneratedFile[];
}
