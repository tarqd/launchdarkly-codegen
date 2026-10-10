/**
 * A configuration, model or API error. The CLI reports the message and exits
 * with code 2 (DESIGN.md → CLI). Anything else escaping is a bug.
 */
export class CodegenError extends Error {
  override readonly name = 'CodegenError';
  readonly exitCode = 2;
}
