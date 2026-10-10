/**
 * A target's own config keys, declared by its emitter (DESIGN.md → Emitters,
 * ADR 0005). Config loading parses them through these declarations, so a bad
 * value is a config error before anything is emitted, and the declarations'
 * descriptions and examples can document each key.
 */

/** The JSON type a target option's value must have. */
export type OptionType = 'string' | 'number' | 'boolean';

interface OptionTypes {
  string: string;
  number: number;
  boolean: boolean;
}

/** One target option: its type, whether it's required, its docs and its target-specific checks. */
export interface TargetOption<T extends OptionType = OptionType, Req extends boolean = boolean, R = unknown> {
  type: T;
  required: Req;
  /** What the option is for, as a sentence. */
  description: string;
  /** A valid value, as the config file spells it. */
  example: string;
  /**
   * The target's own checks, given a value already known to be of `type`.
   * `fail` takes the rest of the sentence after the key (`must be …`).
   * Without `parse`, any value of `type` is accepted as is.
   */
  parse?: (value: OptionTypes[T], fail: (message: string) => never) => R;
}

/** A target's options, keyed as the config file spells them. */
export type OptionDeclarations = Readonly<Record<string, TargetOption<any, boolean, unknown>>>;

/** The parsed options a set of declarations gives: an optional option that is missing is `undefined`. */
export type OptionValues<D extends OptionDeclarations> = {
  -readonly [K in keyof D]: D[K] extends TargetOption<any, infer Req, infer R> ? (Req extends true ? R : R | undefined) : never;
};

/** Declares one target option, so its value type follows from `type` and `parse`. */
export function targetOption<const T extends OptionType, const Req extends boolean, R = OptionTypes[T]>(
  option: TargetOption<T, Req, R>,
): TargetOption<T, Req, R> {
  return option;
}

/**
 * Parses `raw`'s option keys through `declarations`; other keys are left to
 * the caller. `fail(key, message)` reports a bad option and must throw.
 */
export function parseTargetOptions<D extends OptionDeclarations>(
  declarations: D,
  raw: Readonly<Record<string, unknown>>,
  fail: (key: string, message: string) => never,
): OptionValues<D> {
  const options: Record<string, unknown> = {};
  for (const [key, option] of Object.entries(declarations)) {
    const value = raw[key];
    if (value === undefined) {
      if (option.required) fail(key, `is required (for example ${option.example})`);
      options[key] = undefined;
      continue;
    }
    if (typeof value !== option.type) fail(key, `must be a ${option.type}, got ${JSON.stringify(value)}`);
    options[key] = option.parse ? option.parse(value, (message) => fail(key, message)) : value;
  }
  return options as OptionValues<D>;
}
