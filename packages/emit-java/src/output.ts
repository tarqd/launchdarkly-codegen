/**
 * The pieces of java output that the emitter (`index.ts`) writes and the
 * read-back parser (`flag-changes.ts`) recognizes, kept in one place so the
 * two can't drift apart. Each kind's types and SDK methods are in `kinds.ts`.
 */

/** The `Flags` class's field holding the SDK client; flag methods call through it. */
export const CLIENT_FIELD = 'client';

/** The nested class holding each flag's key as a constant. */
export const KEYS_CLASS = 'Keys';

/** The `Keys` class's declaration, before its `{`. */
export const KEYS_DECLARATION = `public static final class ${KEYS_CLASS}`;

/** The `Keys` class's private constructor, its first member. */
export const KEYS_CONSTRUCTOR = `private ${KEYS_CLASS}() {}`;

/** What starts each `Keys` constant's declaration, before its name. */
export const KEY_CONSTANT_HEAD = 'public static final String';

/** The annotation on a deprecated flag's methods and `Keys` constant. */
export const DEPRECATED = '@Deprecated';

/** The type and name of every evaluation method's first parameter. */
export const CONTEXT_TYPE = 'LDContext';
export const CONTEXT_PARAM = 'context';

/** The name of every evaluation method's second parameter, typed as the flag's kind. */
export const FALLBACK_PARAM = 'fallback';
