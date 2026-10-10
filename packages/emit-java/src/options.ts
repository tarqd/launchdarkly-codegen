/**
 * The java target's own config keys (DESIGN.md → java → Config). Config
 * parsing passes them through unchecked, so the emitter validates them and
 * a bad value is a CodegenError (exit 2) naming the key.
 */

import { CodegenError, type TargetConfig } from '@launchtarqly/core';
import { JAVA_RESERVED_WORDS } from './naming.js';

export interface JavaOptions {
  /** The generated file's `package`, e.g. `com.example.flags`. */
  package: string;
}

const SEGMENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export function javaOptions(cfg: TargetConfig): JavaOptions {
  const pkg = cfg.package;
  if (pkg === undefined) throw new CodegenError('java target: `package` is required (for example com.example.flags)');
  if (typeof pkg !== 'string') throw new CodegenError('java target: `package` must be a string');
  for (const segment of pkg.split('.')) {
    if (!SEGMENT.test(segment) || JAVA_RESERVED_WORDS.has(segment)) {
      throw new CodegenError(
        `java target: \`package\` "${pkg}" must be dot-separated Java identifiers, each matching [A-Za-z_$][A-Za-z0-9_$]* and not a reserved word`,
      );
    }
  }
  return { package: pkg };
}
