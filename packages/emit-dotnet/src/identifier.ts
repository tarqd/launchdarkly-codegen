/**
 * A C# identifier (C# spec → Lexical structure → Identifiers), without the
 * `@` prefix or Unicode escapes: a letter or `_`, then letters, digits,
 * connecting, combining and formatting characters. Use it with the `u` flag.
 */
export const IDENTIFIER = String.raw`[\p{L}\p{Nl}_][\p{L}\p{Nl}\p{Nd}\p{Pc}\p{Mn}\p{Mc}\p{Cf}]*`;
