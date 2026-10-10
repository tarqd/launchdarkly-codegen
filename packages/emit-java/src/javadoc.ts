/**
 * Javadoc for the generated members (DESIGN.md → java → Shape, and Doc
 * comments): what each comment says, the escaping of user text, and
 * `javadocLines`, which lays a comment out the way google-java-format
 * 1.37.0 would (ADR 0004).
 */

import { deprecationText, docTrailer, type Flag } from '@launchtarqly/core';
import { CONTINUATION, MAX_WIDTH } from './layout.js';

/**
 * Makes user text (a name, description, tag, maintainer or deprecation
 * message) safe inside Javadoc (DESIGN.md → Doc comments → Java): HTML
 * metacharacters, `*` + `/`, backslashes (javac decodes `\u` even in
 * comments), and an `@` that starts a word or follows `{`, which Javadoc
 * would read as a tag.
 */
export function escapeJavadoc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\//g, '*&#47;')
    .replace(/\\/g, '&#92;')
    .replace(/(^|[\s{])@/g, '$1&#64;');
}

/**
 * A doc comment's content, already escaped. Each paragraph's words are
 * separated by any whitespace (source line breaks included); `<br>` ends a
 * line. Every paragraph after the first is written as a `<p>` paragraph.
 * Each tag is one block tag, such as `@return the value`.
 */
export interface Javadoc {
  paragraphs: readonly string[];
  tags?: readonly string[];
}

/**
 * The lines of a `/** ... *\/` comment laid out as google-java-format 1.37.0
 * leaves it (ADR 0004), for a comment whose `/**` starts at column `indent`.
 * The lines carry no indentation of their own: write each at that indent.
 */
export function javadocLines(doc: Javadoc, indent: number): string[] {
  const paragraphs = doc.paragraphs.map((p, i) => (i === 0 ? p : `<p>${p}`));
  const tags = doc.tags ?? [];
  if (tags.length === 0 && paragraphs.length === 1 && !paragraphs[0]!.includes('<br>')) {
    const single = `/** ${words(paragraphs[0]!).join(' ')} */`;
    if (indent + single.length <= MAX_WIDTH) return [single];
  }
  const body: string[][] = [
    ...paragraphs.map((p) => fill(p, indent, '')),
    ...(tags.length > 0 ? [tags.flatMap((t) => fill(t, indent, CONTINUATION))] : []),
  ];
  const lines = body.flatMap((block, i) => [...(i > 0 ? [''] : []), ...block]);
  return ['/**', ...lines.map((l) => (l === '' ? ' *' : ` * ${l}`)), ' */'];
}

function words(text: string): string[] {
  return text.split(/\s+/).filter((w) => w !== '');
}

/**
 * Greedily fills `text` into lines that end by column 100 once prefixed with
 * the indent and ` * `; lines after the first start with `continuation`. A
 * word that doesn't fit an empty line sits alone and overflows. `<br>` is
 * a token of its own, written without a space before it, that ends the line;
 * like a word, it moves to the next line when it doesn't fit.
 */
function fill(text: string, indent: number, continuation: string): string[] {
  const room = MAX_WIDTH - indent - ' * '.length;
  const lines: string[] = [];
  let line: string | undefined;
  const add = (token: string, separator: string): void => {
    if (line === undefined) line = (lines.length > 0 ? continuation : '') + token;
    else if (line.length + separator.length + token.length <= room) line += separator + token;
    else {
      lines.push(line);
      line = continuation + token;
    }
  };
  for (const segment of text.split(/(?<=<br>)/)) {
    const br = segment.endsWith('<br>');
    for (const word of words(br ? segment.slice(0, -'<br>'.length) : segment)) add(word, ' ');
    if (br) add('<br>', '');
    if (line !== undefined) lines.push(line);
    line = undefined;
  }
  return lines;
}

/** Which of a flag's two methods a comment documents. */
export type MethodVariant = 'value' | 'detail';

const RETURNS: Record<MethodVariant, string> = {
  value: "the flag's value for {@code context}",
  detail: "the flag's value for {@code context}, with the reason it was chosen",
};

/**
 * The comment on a flag's `x` or `xDetail` method: the name, each description
 * paragraph, the key/tags/maintainer trailer and UI link, then the block tags.
 */
export function methodDoc(flag: Flag, variant: MethodVariant): Javadoc {
  return {
    paragraphs: [escapeJavadoc(flag.name), ...descriptionParagraphs(flag.description), trailer(flag)],
    tags: [
      '@param context the context to evaluate the flag for',
      "@param fallback the value to return if the flag can't be evaluated",
      `@return ${RETURNS[variant]}`,
      ...deprecatedTag(flag),
    ],
  };
}

/** The comment on a flag's `Keys` constant: its key, and `@deprecated` when the flag is. */
export function keyConstantDoc(flag: Flag): Javadoc {
  return { paragraphs: [`{@code ${flag.key}}`], tags: deprecatedTag(flag) };
}

/** The comment on the `Flags` class. */
export function classDoc(projectKey: string): Javadoc {
  return { paragraphs: [`Typed accessors for the flags in LaunchDarkly project {@code ${projectKey}}.`] };
}

/** Whether a comment carries `@deprecated`, so its member must carry `@Deprecated` too. */
export function isDeprecated(doc: Javadoc): boolean {
  return (doc.tags ?? []).some((t) => t.startsWith('@deprecated '));
}

/** Blank-line-separated paragraphs, escaped; single newlines inside one are left for the fill to join. */
function descriptionParagraphs(description: string): string[] {
  return description
    .split(/\r?\n[ \t]*\r?\n/)
    .map((p) => p.trim())
    .filter((p) => p !== '')
    .map(escapeJavadoc);
}

/** Inline code in Javadoc. Keys need no escaping. */
const javadocCode = (key: string): string => `{@code ${key}}`;

/** `key: {@code k} · tags: … · maintainer: …<br>` and the UI link. */
function trailer(flag: Flag): string {
  return `${docTrailer(flag, javadocCode, escapeJavadoc)}<br>\n${flag.uiUrl}`;
}

/** The `@deprecated` tag, when the flag is deprecated. */
function deprecatedTag(flag: Flag): string[] {
  const text = deprecationText(flag, javadocCode, escapeJavadoc);
  return text === undefined ? [] : [`@deprecated ${text}`];
}
