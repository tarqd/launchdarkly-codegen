/**
 * Go doc comment text (DESIGN.md → Doc comments, Deprecation, and go →
 * Doc comments, Sanitizing doc text).
 */

import type { Flag } from '@launchtarqly/core';

/**
 * The primary method's doc comment, one entry per comment line without the
 * `// ` prefix (an empty entry is a bare `//`): the summary, the description,
 * the trailer and UI link, and the `Deprecated:` paragraph.
 */
export function methodDoc(ident: string, flag: Flag): string[] {
  const paragraphs: string[][] = [[`${ident} evaluates the "${oneLine(flag.name)}" flag.`]];
  // A paragraph gofmt could reinterpret (an old-style heading, a block of link
  // definitions it would move to the end, or a Deprecated: notice) is joined
  // to the one before it. Over-matching is harmless: a joined paragraph is
  // always stable.
  for (const p of descriptionParagraphs(flag.description)) {
    if (reinterpretable(p)) paragraphs[paragraphs.length - 1]!.push(...p);
    else paragraphs.push(p);
  }
  paragraphs.push([trailer(flag), flag.uiUrl]);
  const deprecated = deprecation(flag);
  if (deprecated !== undefined) paragraphs.push([deprecated]);
  return paragraphs.flatMap((p, i) => (i === 0 ? p : ['', ...p]));
}

function reinterpretable(paragraph: readonly string[]): boolean {
  return (
    (paragraph.length === 1 && isOldHeading(paragraph[0]!)) ||
    paragraph.every((line) => /^\[.*\]:[ \t]/.test(line)) ||
    paragraph[0]!.startsWith('Deprecated: ')
  );
}

/**
 * gofmt's `isOldHeading` test for one line: starts with an uppercase letter,
 * ends with a letter or digit, has no other punctuation than `,` `.` `-` `(`
 * `)` `'`, an apostrophe only as `'s`, and a period only inside a word.
 */
function isOldHeading(line: string): boolean {
  if (!/^\p{Lu}/u.test(line) || !/[\p{L}\p{N}]$/u.test(line)) return false;
  if (/[;:!?+*/=[\]{}_^°&§~%#@<">\\]/.test(line)) return false;
  for (const m of line.matchAll(/'/g)) if (!/^s(\s|$)/.test(line.slice(m.index + 1))) return false;
  for (const m of line.matchAll(/\./g)) if (/^(\s|$)/.test(line.slice(m.index + 1))) return false;
  return true;
}

/** `key: "<key>" · tags: … · maintainer: …`. */
function trailer(flag: Flag): string {
  const parts = [`key: "${flag.key}"`];
  if (flag.tags.length > 0) parts.push(`tags: ${flag.tags.join(', ')}`);
  if (flag.maintainer) {
    parts.push(`maintainer: ${flag.maintainer.kind === 'team' ? `team ${flag.maintainer.name}` : flag.maintainer.email}`);
  }
  return oneLine(parts.join(' · '));
}

/**
 * The `Deprecated: …` line for a deprecated flag: its message, else a generic
 * one naming the flag. No date, so output doesn't churn.
 */
export function deprecation(flag: Flag): string | undefined {
  if (!flag.deprecated) return undefined;
  const message = oneLine(flag.deprecationMessage ?? '');
  return `Deprecated: ${message === '' ? `The "${flag.key}" flag is deprecated.` : message}`;
}

/** One description line as gofmt leaves it alone: no control characters, NUL or BOM, no tabs, trimmed. */
function cleanLine(line: string): string {
  return line
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f\ufeff]/g, '')
    .replace(/\t/g, ' ')
    .trim()
    .replace(/``/g, '“')
    .replace(/''/g, '”');
}

/**
 * Text that must stay on one comment line (the flag name, the trailer, the
 * deprecation message): cleaned like a description line, whitespace runs
 * collapsed.
 */
function oneLine(text: string): string {
  return cleanLine(text.replace(/\r\n|\r|\n/g, ' ')).replace(/\s+/g, ' ');
}

/** The description's paragraphs, split on runs of blank lines. */
function descriptionParagraphs(text: string): string[][] {
  const paragraphs: string[][] = [];
  let current: string[] = [];
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const line = cleanLine(raw);
    if (line !== '') current.push(line);
    else if (current.length > 0) {
      paragraphs.push(current);
      current = [];
    }
  }
  if (current.length > 0) paragraphs.push(current);
  return paragraphs;
}
