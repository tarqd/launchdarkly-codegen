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

/**
 * staticcheck's ST1003 default initialisms as of 2025.1.1, frozen (ADR 0002).
 * Adding or removing one renames every Go identifier built from that word.
 */
export const GO_INITIALISMS: ReadonlySet<string> = new Set([
  'ACL', 'AMQP', 'API', 'ASCII', 'CPU', 'CSS', 'DB', 'DNS', 'EOF', 'GID', 'GUID', 'HTML', 'HTTP', 'HTTPS',
  'ID', 'IP', 'JSON', 'QPS', 'RAM', 'RPC', 'RTP', 'SIP', 'SLA', 'SMTP', 'SQL', 'SSH', 'TCP', 'TLS', 'TS',
  'TTL', 'UDP', 'UI', 'UID', 'URI', 'URL', 'UTF8', 'UUID', 'VM', 'XML', 'XMPP', 'XSRF', 'XSS',
]);

export interface UpperCamelOptions {
  /**
   * Words to write all upper-case instead of capitalized, spelled upper-case:
   * with `GO_INITIALISMS`, `api-url-id` → `APIURLID`. Only whole words match,
   * plus a listed word followed by a plural `s`, which stays lower-case:
   * `banner-ids` → `BannerIDs` (ADR 0002).
   */
  initialisms?: ReadonlySet<string>;
}

/**
 * `checkout-v2.new_flow` → `CheckoutV2NewFlow`. Acronyms are ordinary words
 * (`api-url` → `ApiUrl`) unless listed in `initialisms`.
 */
export function upperCamel(key: string, options: UpperCamelOptions = {}): string {
  const { initialisms } = options;
  return splitWords(key)
    .map((word) => {
      const upper = word.toUpperCase();
      if (initialisms?.has(upper)) return upper;
      // A listed word wins over a plural reading: `https` is HTTPS, not HTTPs.
      if (word.endsWith('s') && initialisms?.has(upper.slice(0, -1))) return `${upper.slice(0, -1)}s`;
      return capitalize(word);
    })
    .join('');
}

/** `checkoutV2NewFlow` (or `checkout-v2.new_flow`) → `CHECKOUT_V2_NEW_FLOW` */
export function constantCase(name: string): string {
  return splitWords(name)
    .map((word) => word.toUpperCase())
    .join('_');
}
