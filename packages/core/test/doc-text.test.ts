import { describe, expect, it } from 'vitest';
import { defaultDeprecationMessage, docTrailer } from '../src/index.js';
import { modelFlag } from './builders.js';

const backticks = (text: string) => `\`${text}\``;

describe('docTrailer', () => {
  it('is just the key, written as the target writes inline code, when there are no tags or maintainer', () => {
    expect(docTrailer(modelFlag('checkout-v2'), backticks)).toBe('key: `checkout-v2`');
  });

  it('adds tags, then a member maintainer by email, joined with " · "', () => {
    const flag = modelFlag('checkout-v2', {
      tags: ['checkout', 'web'],
      maintainer: { kind: 'member', email: 'ana@example.com', name: 'Ana' },
    });
    expect(docTrailer(flag, (k) => `"${k}"`)).toBe('key: "checkout-v2" · tags: checkout, web · maintainer: ana@example.com');
  });

  it('shows a team maintainer as "team <name>"', () => {
    const flag = modelFlag('f', { maintainer: { kind: 'team', key: 'pay', name: 'Payments' } });
    expect(docTrailer(flag, backticks)).toBe('key: `f` · maintainer: team Payments');
  });
});

describe('defaultDeprecationMessage', () => {
  it('names the flag, with no date', () => {
    expect(defaultDeprecationMessage(modelFlag('old-thing'), backticks)).toBe('The `old-thing` flag is deprecated.');
  });
});
