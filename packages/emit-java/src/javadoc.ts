/**
 * Javadoc for the generated members (DESIGN.md → java → Shape, and Doc
 * comments). Each returns the comment's lines for `Writer.docComment`; an
 * empty entry is a bare ` *`.
 */

import type { Flag } from '@launchtarqly/core';

/** Which of a flag's two methods a comment documents. */
export type MethodVariant = 'value' | 'detail';

const RETURNS: Record<MethodVariant, string> = {
  value: "the flag's value for {@code context}",
  detail: "the flag's value for {@code context}, with the reason it was chosen",
};

/** The comment on a flag's `x` or `xDetail` method. */
export function methodDoc(flag: Flag, variant: MethodVariant): string[] {
  return [
    flag.name,
    '',
    '@param context the context to evaluate the flag for',
    "@param fallback the value to return if the flag can't be evaluated",
    `@return ${RETURNS[variant]}`,
  ];
}

/** The one-line comment on a flag's `Keys` constant. */
export function keyConstantDoc(flag: Flag): string {
  return `{@code ${flag.key}}`;
}

/** The one-line comment on the `Flags` class. */
export function classDoc(projectKey: string): string {
  return `Typed accessors for the flags in LaunchDarkly project {@code ${projectKey}}.`;
}
