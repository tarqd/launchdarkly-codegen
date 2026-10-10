import { describe, expect, it } from 'vitest';
import { lowerCamel } from '../src/index.js';

describe('lowerCamel', () => {
  it('converts the DESIGN.md example key', () => {
    expect(lowerCamel('checkout-v2.new_flow')).toBe('checkoutV2NewFlow');
  });

  it('splits on case changes, including acronym runs', () => {
    expect(lowerCamel('HTTPServerTimeout')).toBe('httpServerTimeout');
    expect(lowerCamel('enableNewUI')).toBe('enableNewUi');
  });

  it('splits on slashes and whitespace and drops other characters', () => {
    expect(lowerCamel('billing/dark mode!')).toBe('billingDarkMode');
  });
});
