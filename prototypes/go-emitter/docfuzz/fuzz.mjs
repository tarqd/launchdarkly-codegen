// PROTOTYPE: can a small sanitizer make arbitrary flag names and descriptions
// gofmt-stable in Go doc comments? Writes N funcs, runs gofmt, diffs.
// Usage: node fuzz.mjs <trailer: list|line> [iterations] [seed]
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const style = process.argv[2] ?? 'list';
const N = Number(process.argv[3] ?? 4000);
let seed = Number(process.argv[4] ?? 1);
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = (a) => a[Math.floor(rnd() * a.length)];

const PIECES = ['Routes eligible users', 'to the flow', '.', ':', '``quoted``', "''x''", "it's", "don't",
  '*/', '/*', '# Heading', '#tag', '- item', '* item', '1. one', '2) two', '+ plus', '[Link]: https://x.y/z',
  '[Name]', 'https://example.com/a_b', 'func f() {', 'line\\', '\t', '  ', '    indented', '\r', '\r\n',
  '\n', '\n', '\n\n', '\n\n\n', '  \n', 'Ünïcödé', '日本語', '\u0000', '﻿', 'Deprecated: old', '//go:generate x',
  'A', 'Title Case Words', 'v1.2', 'e.g. this', '"q"', '<b>&amp;</b>', '%d', '{x}', 'end', ' ', ' ', ' '];

function gen() {
  let s = '';
  const n = 1 + Math.floor(rnd() * 12);
  for (let i = 0; i < n; i++) s += pick(PIECES) + (rnd() < 0.5 ? ' ' : '');
  return s;
}

// ---- the sanitizer under test ----
const LINK_DEF = /^\[[^\]\n]+\]:\s*\S+$/;
function isOldHeading(line) {
  if (!/^\p{Lu}/u.test(line) || !/[\p{L}\p{N}]$/u.test(line)) return false;
  if (/[;:!?+*/=[\]{}_^°&§~%#@<">\\]/.test(line)) return false;
  for (const m of line.matchAll(/'/g)) if (!/^s(\s|$)/.test(line.slice(m.index + 1))) return false;
  for (const m of line.matchAll(/\./g)) if (/^(\s|$)/.test(line.slice(m.index + 1))) return false;
  return true;
}
function cleanLine(l) {
  return l.replace(/[\u0000-\u0008\u000b-\u001f\u007f﻿]/g, '').replace(/\t/g, ' ')
    .trim().replace(/``/g, '“').replace(/''/g, '”');
}
/** Description → paragraphs of comment lines (no "// " prefix). */
function paragraphs(text) {
  const out = []; let cur = [];
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const l = cleanLine(raw);
    if (l === '') { if (cur.length) out.push(cur), (cur = []); } else cur.push(l);
  }
  if (cur.length) out.push(cur);
  return out;
}
function docComment(ident, name, desc, deprecated) {
  const n = cleanLine(name.replace(/\r\n|\r|\n/g, ' ')).replace(/\s+/g, ' ');
  const paras = [[`${ident} evaluates the "${n}" flag.`]];
  // A paragraph gofmt could reinterpret (an old-style heading, or a block of
  // link definitions it would move to the end) is joined to the paragraph
  // before it. Over-matching is harmless: a joined paragraph is always stable.
  for (const p of paragraphs(desc)) {
    const risky = (p.length === 1 && isOldHeading(p[0])) || p.every((l) => /^\[.*\]:[ \t]/.test(l)) || /^Deprecated: /.test(p[0]);
    if (risky) paras[paras.length - 1].push(...p); else paras.push(p);
  }
  paras.push(style === 'list'
    ? ['  - key: "x" · tags: a, b', '  - https://app.launchdarkly.com/projects/p/flags/x']
    : ['key: "x" · tags: a, b', 'https://app.launchdarkly.com/projects/p/flags/x']);
  if (deprecated) paras.push(['Deprecated: Use other instead.']);
  return paras.map((p) => p.map((l) => `// ${l}`).join('\n')).join('\n//\n');
}
// ----

let src = 'package p\n';
const cases = [];
for (let i = 0; i < N; i++) {
  const name = gen(), desc = gen();
  cases.push({ name, desc });
  src += `\n${docComment(`F${i}`, name, desc, rnd() < 0.3)}\nfunc F${i}() {}\n`;
}
const dir = mkdtempSync(join(tmpdir(), 'docfuzz-'));
writeFileSync(join(dir, 'p.go'), src);
let diff = '';
try { execFileSync('gofmt', ['-d', join(dir, 'p.go')], { encoding: 'utf8' }); }
catch (e) { diff = e.stdout || e.stderr || String(e); }
const out = execFileSync('gofmt', ['-l', join(dir, 'p.go')], { encoding: 'utf8' });
if (out.trim() === '') { console.log(`${style}: ${N} cases stable under gofmt`); }
else {
  diff = execFileSync('sh', ['-c', `gofmt -d ${join(dir, 'p.go')} || true`], { encoding: 'utf8' });
  console.log(diff.split('\n').slice(0, 80).join('\n'));
  process.exitCode = 1;
}
