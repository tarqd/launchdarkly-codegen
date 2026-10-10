import { describe, expect, it } from 'vitest';
import { deprecationText, maintainerLabel } from '../src/index.js';
import { modelFlag } from './builders.js';

describe('deprecationText', () => {
  it("is the flag's own deprecation message", () => {
    expect(deprecationText(modelFlag('cart', { deprecated: true, deprecationMessage: 'Use cart-v2.' }))).toBe(
      'Use cart-v2.',
    );
  });

  it('is a generic message naming the flag when there is no message', () => {
    expect(deprecationText(modelFlag('legacy-cart', { deprecated: true }))).toBe('The `legacy-cart` flag is deprecated.');
  });

  it('is undefined for a flag that is not deprecated', () => {
    expect(deprecationText(modelFlag('cart', { deprecationMessage: 'stale' }))).toBeUndefined();
  });

  it("passes the flag's message through escape", () => {
    const flag = modelFlag('old-flag', { deprecated: true, deprecationMessage: 'Use <new>.' });
    expect(deprecationText(flag, undefined, (t) => t.replace(/</g, '&lt;'))).toBe('Use &lt;new>.');
  });

  it('marks up the key in the generic message with code, without escaping it', () => {
    const flag = modelFlag('old-flag', { deprecated: true });
    expect(deprecationText(flag, (key) => `{@code ${key}}`, () => 'escaped')).toBe(
      'The {@code old-flag} flag is deprecated.',
    );
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
