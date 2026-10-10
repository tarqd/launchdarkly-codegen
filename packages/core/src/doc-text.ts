/**
 * Doc-comment text every target shares (DESIGN.md → Doc comments,
 * Deprecation). Each emitter wraps it in its own comment syntax; `code` writes
 * a flag key the way the target shows inline code (backticks in TSDoc and in
 * .NET `[Obsolete]` messages, `<c>` in XML docs, quotes in Go, `{@code}` in
 * Javadoc), and `text` escapes the plain parts for the target (XML escaping
 * in .NET, Javadoc escaping in Java).
 */

import type { Flag, Maintainer } from './model.js';

type Format = (text: string) => string;

const verbatim: Format = (text) => text;

/** `key: <key> · tags: … · maintainer: …`, a team maintainer shown as `team <name>`. */
export function docTrailer(flag: Flag, code: Format, text: Format = verbatim): string {
  const parts = [`key: ${code(flag.key)}`];
  if (flag.tags.length > 0) parts.push(`tags: ${text(flag.tags.join(', '))}`);
  if (flag.maintainer) parts.push(`maintainer: ${text(maintainerLabel(flag.maintainer))}`);
  return parts.join(' · ');
}

/** The maintainer as the doc trailer shows it: a member's email, or `team <name>`. */
export function maintainerLabel(maintainer: Maintainer): string {
  return maintainer.kind === 'team' ? `team ${maintainer.name}` : maintainer.email;
}

/**
 * A deprecated flag's message formatted with `text`, else
 * {@link defaultDeprecationMessage}; `undefined` if it isn't deprecated.
 */
export function deprecationText(flag: Flag, code: Format, text: Format = verbatim): string | undefined {
  if (!flag.deprecated) return undefined;
  const message = flag.deprecationMessage;
  return message !== undefined ? text(message) : defaultDeprecationMessage(flag, code);
}

/** The deprecation text for a deprecated flag with no message. No date, so output doesn't churn. */
export function defaultDeprecationMessage(flag: Flag, code: Format): string {
  return `The ${code(flag.key)} flag is deprecated.`;
}
