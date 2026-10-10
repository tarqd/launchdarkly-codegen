/**
 * Line-based unified diff for `check` (DESIGN.md → CLI). Myers' O(ND)
 * algorithm; output matches `diff -u` closely enough for humans and CI logs.
 */

type Op = { type: ' ' | '-' | '+'; line: string };

const CONTEXT = 3;
const NO_EOL = '\\ No newline at end of file';

/** Splits text into lines that keep their `\n`, so a missing final newline is a difference. */
function splitLines(text: string): string[] {
  const parts = text.split('\n');
  const result = parts.slice(0, -1).map((l) => `${l}\n`);
  const last = parts[parts.length - 1]!;
  if (last !== '') result.push(last);
  return result;
}

function diffLines(a: string[], b: string[]): Op[] {
  // Trim the common prefix and suffix; generated files usually differ in a few places.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const middle = myers(a.slice(start, endA), b.slice(start, endB));
  return [
    ...a.slice(0, start).map((line): Op => ({ type: ' ', line })),
    ...middle,
    ...a.slice(endA).map((line): Op => ({ type: ' ', line })),
  ];
}

function myers(a: string[], b: string[]): Op[] {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  // trace[d] holds v[-d..d] as it stood before step d.
  const trace: Int32Array[] = [];
  let found = max === 0;
  for (let d = 0; d <= max && !found; d++) {
    trace.push(v.slice(offset - d, offset + d + 1));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!) ? v[offset + k + 1]! : v[offset + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        found = true;
        break;
      }
    }
  }

  const ops: Op[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0; d--) {
    const prev = trace[d]!;
    const at = (k: number) => prev[k + d]!;
    const k = x - y;
    const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const prevX = d === 0 ? 0 : at(prevK);
    const prevY = d === 0 ? 0 : prevX - prevK;
    while (x > prevX && y > prevY) {
      ops.push({ type: ' ', line: a[--x]! });
      y--;
    }
    if (d > 0) {
      if (x === prevX) ops.push({ type: '+', line: b[--y]! });
      else ops.push({ type: '-', line: a[--x]! });
    }
  }
  return ops.reverse();
}

function formatLine(op: Op): string {
  const text = `${op.type}${op.line}`;
  return text.endsWith('\n') ? text : `${text}\n${NO_EOL}\n`;
}

function range(start: number, count: number): string {
  // A zero-length range names the line before it (`-0,0` for an empty file).
  return `${count === 0 ? start : start + 1},${count}`;
}

/**
 * A unified diff from `oldText` (on disk; `undefined` when the file is
 * missing) to `newText`, or "" when they are equal.
 */
export function unifiedDiff(path: string, oldText: string | undefined, newText: string): string {
  if (oldText === newText) return '';
  const ops = diffLines(splitLines(oldText ?? ''), splitLines(newText));

  // Group changes whose context windows touch into hunks.
  const hunks: [number, number][] = [];
  ops.forEach((op, i) => {
    if (op.type === ' ') return;
    const last = hunks[hunks.length - 1];
    const from = Math.max(0, i - CONTEXT);
    if (last && from <= last[1]) last[1] = Math.min(ops.length, i + CONTEXT + 1);
    else hunks.push([from, Math.min(ops.length, i + CONTEXT + 1)]);
  });

  let out = `--- ${oldText === undefined ? '/dev/null' : `a/${path}`}\n+++ b/${path}\n`;
  let oldLine = 0;
  let newLine = 0;
  let cursor = 0;
  for (const [from, to] of hunks) {
    for (; cursor < from; cursor++) {
      oldLine++;
      newLine++;
    }
    const body = ops.slice(from, to);
    const oldCount = body.filter((op) => op.type !== '+').length;
    const newCount = body.filter((op) => op.type !== '-').length;
    out += `@@ -${range(oldLine, oldCount)} +${range(newLine, newCount)} @@\n`;
    for (const op of body) out += formatLine(op);
    oldLine += oldCount;
    newLine += newCount;
    cursor = to;
  }
  return out;
}
