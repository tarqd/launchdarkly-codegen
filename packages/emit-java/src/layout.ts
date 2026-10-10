/**
 * google-java-format 1.37.0's line breaks for the declarations the java
 * emitter writes (ADR 0004; DESIGN.md → java → Canonical form). Each function
 * returns the lines of one declaration whose first line starts at column
 * `indent`. The lines carry no indentation of their own beyond the
 * continuation indent: write each at that indent.
 */

/** google-java-format's line limit, in UTF-16 code units. */
const MAX_WIDTH = 100;
/** The extra indent of a continuation line. */
const CONTINUATION = '    ';

function fits(line: string, indent: number): boolean {
  return indent + line.length <= MAX_WIDTH;
}

/**
 * `open`, then `items` and `close`: on one line when it fits, else after a
 * break 4 deeper on one line, else one item per line.
 */
function brokenList(open: string, items: readonly string[], close: string, indent: number): string[] {
  const one = `${open}${items.join(', ')}${close}`;
  if (fits(one, indent)) return [one];
  const joined = `${CONTINUATION}${items.join(', ')}${close}`;
  if (fits(joined, indent)) return [open, joined];
  return [
    open,
    ...items.flatMap((item, i) => {
      const end = i === items.length - 1 ? close : ',';
      const line = `${CONTINUATION}${item}${end}`;
      const qualified = /^(\w+)(\.\w+)$/.exec(item);
      if (fits(line, indent) || qualified === null) return [line];
      // A field access that still passes 100 breaks before its `.`, 4 deeper again.
      return [`${CONTINUATION}${qualified[1]}`, `${CONTINUATION}${CONTINUATION}${qualified[2]}${end}`];
    }),
  ];
}

/** A field declaration `[annotation] head name = value;`, such as a `Keys` constant. */
export interface Constant {
  /** Written on the same line while the whole declaration fits, else on its own line. */
  annotation?: string;
  head: string;
  name: string;
  value: string;
}

/**
 * The lines of a constant, ending with `;`. Past column 100 it breaks after
 * `=`, the value 4 deeper; when even `head name =` passes 100, it breaks
 * after the type too, the name 4 deeper and the value 8.
 */
export function constantLines(constant: Constant, indent: number): string[] {
  const { annotation, head, name, value } = constant;
  if (annotation !== undefined) {
    const one = `${annotation} ${head} ${name} = ${value};`;
    if (fits(one, indent)) return [one];
    return [annotation, ...constantLines({ head, name, value }, indent)];
  }
  const assignment = (prefix: string, at: number) => {
    const one = `${prefix}${name} = ${value};`;
    return fits(one, at) ? [one] : [`${prefix}${name} =`, `${CONTINUATION}${value};`];
  };
  if (fits(`${head} ${name} =`, indent)) return assignment(`${head} `, indent);
  return [head, ...assignment('', indent + CONTINUATION.length).map((l) => `${CONTINUATION}${l}`)];
}

/** A call statement `head(args);`, such as `return client.boolVariation(…);`. */
export interface Call {
  head: string;
  args: readonly string[];
}

/** The lines of a call statement, ending with `);`. */
export function callLines(call: Call, indent: number): string[] {
  return brokenList(`${call.head}(`, call.args, ');', indent);
}

/** A method declaration: `head name(params) {`, where `head` is its modifiers and return type. */
export interface Signature {
  head: string;
  name: string;
  params: readonly string[];
}

/**
 * The lines of a method signature, ending with ` {`. When even `head name(`
 * passes column 100, the name moves to its own line 4 deeper and the
 * parameters are laid out from there.
 */
export function signatureLines(sig: Signature, indent: number): string[] {
  const open = `${sig.head} ${sig.name}(`;
  if (fits(open, indent)) return brokenList(open, sig.params, ') {', indent);
  const nameIndent = indent + CONTINUATION.length;
  return [
    sig.head,
    ...brokenList(`${sig.name}(`, sig.params, ') {', nameIndent).map((l) => `${CONTINUATION}${l}`),
  ];
}
