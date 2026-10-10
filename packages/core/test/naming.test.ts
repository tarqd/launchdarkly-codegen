import { describe, expect, it } from 'vitest';
import { constantCase, GO_INITIALISMS, lowerCamel, upperCamel } from '../src/index.js';

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

describe('upperCamel', () => {
  it('converts the DESIGN.md example key', () => {
    expect(upperCamel('checkout-v2.new_flow')).toBe('CheckoutV2NewFlow');
  });

  it('capitalizes every word, lowercasing the rest', () => {
    expect(upperCamel('BETA_FEATURE')).toBe('BetaFeature');
    expect(upperCamel('beta.dark_mode')).toBe('BetaDarkMode');
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

describe('upperCamel with the Go initialisms (ADR 0002)', () => {
  const go = (key: string) => upperCamel(key, { initialisms: GO_INITIALISMS });

  it('converts the DESIGN.md example key', () => {
    expect(go('api-url-id')).toBe('APIURLID');
  });

  // ADR 0002's list, copied here so that changing the list in core fails this test.
  const ADR_0002 = [
    'ACL', 'AMQP', 'API', 'ASCII', 'CPU', 'CSS', 'DB', 'DNS', 'EOF', 'GID', 'GUID', 'HTML', 'HTTP', 'HTTPS',
    'ID', 'IP', 'JSON', 'QPS', 'RAM', 'RPC', 'RTP', 'SIP', 'SLA', 'SMTP', 'SQL', 'SSH', 'TCP', 'TLS', 'TS',
    'TTL', 'UDP', 'UI', 'UID', 'URI', 'URL', 'UTF8', 'UUID', 'VM', 'XML', 'XMPP', 'XSRF', 'XSS',
  ];

  it('holds exactly the 42 frozen entries', () => {
    expect(ADR_0002).toHaveLength(42);
    expect([...GO_INITIALISMS].sort()).toEqual([...ADR_0002].sort());
  });

  it.each(ADR_0002)('upper-cases %s wherever it appears as a word', (initialism) => {
    const word = initialism.toLowerCase();
    expect(go(`${word}-flag`)).toBe(`${initialism}Flag`);
    expect(go(`new-${word}`)).toBe(`New${initialism}`);
    expect(go(`new-${word}-flag`)).toBe(`New${initialism}Flag`);
  });

  it('upper-cases runs of initialisms and initialisms found by case changes', () => {
    expect(go('user-id-url')).toBe('UserIDURL');
    expect(go('enableNewUI')).toBe('EnableNewUI');
    expect(go('HTTPServerTimeout')).toBe('HTTPServerTimeout');
    expect(go('userId')).toBe('UserID');
  });

  it('matches whole words only, so a word with a digit must itself be on the list', () => {
    // A digit stays with the word before it: `utf8` is on the list, `http2` is not.
    expect(go('http2-api')).toBe('Http2API');
    expect(go('utf8-name')).toBe('UTF8Name');
    expect(go('identity-urls')).toBe('IdentityUrls');
    expect(go('ids')).toBe('Ids');
  });
});
