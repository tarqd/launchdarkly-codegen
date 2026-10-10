/** Doc-comment text every emitter shows the same way (DESIGN.md → Doc comments). Emitters escape it for their language. */

import type { Flag, Maintainer } from './model.js';

/** A deprecated flag's message, else a generic one naming the flag; `undefined` if it isn't deprecated. No date, so output doesn't churn. */
export function deprecationText(flag: Flag): string | undefined {
  if (!flag.deprecated) return undefined;
  return flag.deprecationMessage ?? `The \`${flag.key}\` flag is deprecated.`;
}

/** The maintainer as the doc trailer shows it: a member's email, or `team <name>`. */
export function maintainerLabel(maintainer: Maintainer): string {
  return maintainer.kind === 'team' ? `team ${maintainer.name}` : maintainer.email;
}
