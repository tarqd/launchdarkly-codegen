import { describe, expect, it } from 'vitest';
import { lowerCamel, upperCamel } from '../src/index.js';

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

  it.each([
    ['dash', 'new-checkout-flow'],
    ['underscore', 'new_checkout_flow'],
    ['dot', 'new.checkout.flow'],
    ['slash', 'new/checkout/flow'],
    ['whitespace', 'new checkout\tflow'],
    ['repeated separators', 'new--checkout__.flow'],
  ])('splits on %s', (_name, key) => {
    expect(lowerCamel(key)).toBe('newCheckoutFlow');
  });

  it('lowercases an all-caps key', () => {
    expect(lowerCamel('BETA_FEATURE')).toBe('betaFeature');
  });

  it('keeps digits with the word before them', () => {
    expect(lowerCamel('checkout2Fast')).toBe('checkout2Fast');
  });

  it('drops characters that are not letters or digits without splitting', () => {
    expect(lowerCamel('enable:new+flow@v2')).toBe('enablenewflowv2');
  });
});

describe('upperCamel', () => {
  it('capitalizes every word, including the first', () => {
    expect(upperCamel('checkout-v2.new_flow')).toBe('CheckoutV2NewFlow');
  });

  it('treats acronyms as ordinary words, with no initialism table', () => {
    expect(upperCamel('api-url-id')).toBe('ApiUrlId');
    expect(upperCamel('HTTPServerTimeout')).toBe('HttpServerTimeout');
  });

  it('keeps a key that is already UpperCamel', () => {
    expect(upperCamel('AllowGuestCheckout')).toBe('AllowGuestCheckout');
  });

  it('keeps a leading digit, for the identifier check to reject', () => {
    expect(upperCamel('2fa-enabled')).toBe('2faEnabled');
  });
});
