/**
 * Doc-comment text every target says the same way (DESIGN.md → Doc
 * comments); each target supplies its own code markup and escaping.
 */

import type { Flag, Maintainer } from './model.js';

/** A maintainer as doc comments name it: `team <name>`, or a member's email. */
export function maintainerText(maintainer: Maintainer): string {
  return maintainer.kind === 'team' ? `team ${maintainer.name}` : maintainer.email;
}

/**
 * The `@deprecated` text: the flag's message passed through `escape`, else a
 * generic one with the key marked up by `code`. No date, so output doesn't
 * churn. `undefined` when the flag isn't deprecated.
 */
export function deprecationText(
  flag: Flag,
  code: (key: string) => string,
  escape: (text: string) => string = (text) => text,
): string | undefined {
  if (!flag.deprecated) return undefined;
  const message = flag.deprecationMessage;
  return message !== undefined ? escape(message) : `The ${code(flag.key)} flag is deprecated.`;
}
