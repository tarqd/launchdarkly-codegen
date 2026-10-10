/**
 * Flag key → identifier conversion (DESIGN.md → Naming).
 *
 * Only the split-and-case conversion lives here. Aliases come from
 * aliases.ts; reserved words, leading digits and collisions are checked in
 * identifiers.ts.
 */

const SEPARATORS = /[-_./\s]+/;
// Case changes: `fooBar` → foo|Bar, `HTTPServer` → HTTP|Server.
const CASE_BOUNDARY = /(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/;

/** Splits a flag key into lowercase words, dropping non-alphanumerics. */
export function splitWords(key: string): string[] {
  return key
    .split(SEPARATORS)
    .flatMap((part) => part.split(CASE_BOUNDARY))
    .map((word) => word.replace(/[^A-Za-z0-9]/g, '').toLowerCase())
    .filter((word) => word.length > 0);
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** `checkout-v2.new_flow` → `checkoutV2NewFlow` */
export function lowerCamel(key: string): string {
  return splitWords(key)
    .map((word, i) => (i === 0 ? word : capitalize(word)))
    .join('');
}

/** `checkout-v2.new_flow` → `CheckoutV2NewFlow` */
export function upperCamel(key: string): string {
  return splitWords(key).map(capitalize).join('');
}
