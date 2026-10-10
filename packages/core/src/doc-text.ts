/**
 * Doc-comment text every target says the same way (DESIGN.md → Doc
 * comments). Each target escapes it for its language, or passes its own code
 * markup and escaping for the deprecation text.
 */

import type { Flag, Maintainer } from './model.js';

/** The maintainer as the doc trailer shows it: a member's email, or `team <name>`. */
export function maintainerLabel(maintainer: Maintainer): string {
  return maintainer.kind === 'team' ? `team ${maintainer.name}` : maintainer.email;
}

/**
 * A deprecated flag's message passed through `escape`, else a generic one
 * naming the flag with the key marked up by `code` (backticks by default).
 * No date, so output doesn't churn. `undefined` if it isn't deprecated.
 */
export function deprecationText(
  flag: Flag,
  code: (key: string) => string = (key) => `\`${key}\``,
  escape: (text: string) => string = (text) => text,
): string | undefined {
  if (!flag.deprecated) return undefined;
  const message = flag.deprecationMessage;
  return message !== undefined ? escape(message) : `The ${code(flag.key)} flag is deprecated.`;
}
