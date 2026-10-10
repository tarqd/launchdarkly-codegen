/**
 * Doc-comment text every target shares (DESIGN.md → Doc comments,
 * Deprecation). Each emitter wraps it in its own comment syntax and applies
 * its own escaping; `code` writes a flag key the way the target shows inline
 * code (backticks in TSDoc, quotes in Go).
 */

import type { Flag } from './model.js';

/** `key: <key> · tags: … · maintainer: …`, a team maintainer shown as `team <name>`. */
export function docTrailer(flag: Flag, code: (text: string) => string): string {
  const parts = [`key: ${code(flag.key)}`];
  if (flag.tags.length > 0) parts.push(`tags: ${flag.tags.join(', ')}`);
  if (flag.maintainer) {
    parts.push(`maintainer: ${flag.maintainer.kind === 'team' ? `team ${flag.maintainer.name}` : flag.maintainer.email}`);
  }
  return parts.join(' · ');
}

/** The deprecation text for a deprecated flag with no message. No date, so output doesn't churn. */
export function defaultDeprecationMessage(flag: Flag, code: (text: string) => string): string {
  return `The ${code(flag.key)} flag is deprecated.`;
}
