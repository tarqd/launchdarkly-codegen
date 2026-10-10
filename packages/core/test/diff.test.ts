import { describe, expect, it } from 'vitest';
import { unifiedDiff } from '../src/index.js';

const lines = (n: number, from = 1) => Array.from({ length: n }, (_, i) => `line ${i + from}\n`).join('');

describe('unifiedDiff', () => {
  it('returns "" for identical text', () => {
    expect(unifiedDiff('f.ts', 'a\nb\n', 'a\nb\n')).toBe('');
  });

  it('shows a changed line with three lines of context', () => {
    const old = lines(10);
    const next = old.replace('line 5\n', 'line five\n');
    expect(unifiedDiff('src/f.ts', old, next)).toBe(
      [
        '--- a/src/f.ts',
        '+++ b/src/f.ts',
        '@@ -2,7 +2,7 @@',
        ' line 2',
        ' line 3',
        ' line 4',
        '-line 5',
        '+line five',
        ' line 6',
        ' line 7',
        ' line 8',
        '',
      ].join('\n'),
    );
  });

  it('splits distant changes into separate hunks', () => {
    const old = lines(20);
    const next = old.replace('line 2\n', 'line 2\nnew\n').replace('line 19\n', '');
    expect(unifiedDiff('f.ts', old, next)).toBe(
      [
        '--- a/f.ts',
        '+++ b/f.ts',
        '@@ -1,5 +1,6 @@',
        ' line 1',
        ' line 2',
        '+new',
        ' line 3',
        ' line 4',
        ' line 5',
        '@@ -16,5 +17,4 @@',
        ' line 16',
        ' line 17',
        ' line 18',
        '-line 19',
        ' line 20',
        '',
      ].join('\n'),
    );
  });

  it('diffs a missing file against /dev/null', () => {
    expect(unifiedDiff('f.ts', undefined, 'a\nb\n')).toBe(
      ['--- /dev/null', '+++ b/f.ts', '@@ -0,0 +1,2 @@', '+a', '+b', ''].join('\n'),
    );
  });

  it('marks a missing final newline', () => {
    expect(unifiedDiff('f.ts', 'a\nb', 'a\nb\n')).toBe(
      ['--- a/f.ts', '+++ b/f.ts', '@@ -1,2 +1,2 @@', ' a', '-b', '\\ No newline at end of file', '+b', ''].join('\n'),
    );
  });
});
