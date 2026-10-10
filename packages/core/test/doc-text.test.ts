import { describe, expect, it } from 'vitest';
import { defaultDeprecationMessage, deprecationText, docTrailer, maintainerLabel } from '../src/index.js';
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

  it('formats the tags and maintainer with `text`, but not the key', () => {
    const flag = modelFlag('a&b', {
      tags: ['x<y'],
      maintainer: { kind: 'team', key: 'rd', name: 'R&D' },
    });
    const upper = (t: string) => t.toUpperCase();
    expect(docTrailer(flag, (k) => `<c>${k}</c>`, upper)).toBe('key: <c>a&b</c> · tags: X<Y · maintainer: TEAM R&D');
  });
});

describe('maintainerLabel', () => {
  it("is a member's email", () => {
    expect(maintainerLabel({ kind: 'member', email: 'ada@example.com', name: 'Ada' })).toBe('ada@example.com');
  });

  it('is `team <name>` for a team', () => {
    expect(maintainerLabel({ kind: 'team', key: 'checkout', name: 'Checkout' })).toBe('team Checkout');
  });
});

describe('deprecationText', () => {
  it("is the flag's own deprecation message", () => {
    expect(deprecationText(modelFlag('cart', { deprecated: true, deprecationMessage: 'Use cart-v2.' }), backticks)).toBe(
      'Use cart-v2.',
    );
  });

  it('is a generic message naming the flag when there is no message', () => {
    expect(deprecationText(modelFlag('legacy-cart', { deprecated: true }), backticks)).toBe(
      'The `legacy-cart` flag is deprecated.',
    );
    expect(deprecationText(modelFlag('legacy-cart', { deprecated: true }), (k) => `"${k}"`)).toBe(
      'The "legacy-cart" flag is deprecated.',
    );
  });

  it('is undefined for a flag that is not deprecated', () => {
    expect(deprecationText(modelFlag('cart', { deprecationMessage: 'stale' }), backticks)).toBeUndefined();
  });
});

describe('defaultDeprecationMessage', () => {
  it('names the flag, with no date', () => {
    expect(defaultDeprecationMessage(modelFlag('old-thing'), backticks)).toBe('The `old-thing` flag is deprecated.');
  });
});
