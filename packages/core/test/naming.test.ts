import { describe, expect, it } from 'vitest';
import { constantCase, lowerCamel } from '../src/index.js';

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

describe('constantCase', () => {
  it('converts the DESIGN.md example from its lowerCamel name', () => {
    expect(constantCase('checkoutV2NewFlow')).toBe('CHECKOUT_V2_NEW_FLOW');
  });

  it('converts a raw key the same way', () => {
    expect(constantCase('checkout-v2.new_flow')).toBe('CHECKOUT_V2_NEW_FLOW');
  });

  it('splits an UpperCamel alias and acronym runs', () => {
    expect(constantCase('SearchV3')).toBe('SEARCH_V3');
    expect(constantCase('HTTPServerTimeout')).toBe('HTTP_SERVER_TIMEOUT');
  });

  it('keeps digits with the word before them', () => {
    expect(constantCase('maxCartItems2x')).toBe('MAX_CART_ITEMS2X');
    expect(constantCase('checkoutV2')).toBe('CHECKOUT_V2');
  });

  it('converts alias-derived names', () => {
    expect(constantCase('myAlias')).toBe('MY_ALIAS');
    expect(constantCase('apiUrlId')).toBe('API_URL_ID');
    expect(constantCase('apiURLId')).toBe('API_URL_ID');
    expect(constantCase('twoFactorEnabled')).toBe('TWO_FACTOR_ENABLED');
  });
});
