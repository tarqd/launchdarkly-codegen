import { describe, expect, it } from 'vitest';
import { CodegenError } from '@launchtarqly/core';
import { resolveConnection } from '../src/connection.js';

describe('resolveConnection', () => {
  it('defaults the base URI to https://app.launchdarkly.com', () => {
    expect(resolveConnection({}, { LD_ACCESS_TOKEN: 't' }, {})).toEqual({
      baseUri: 'https://app.launchdarkly.com',
      accessToken: 't',
    });
  });

  it('takes the base URI from --base-uri over LD_BASE_URI over the config baseUri', () => {
    const env = { LD_ACCESS_TOKEN: 't', LD_BASE_URI: 'https://env.example' };
    const config = { baseUri: 'https://config.example' };
    expect(resolveConnection({ baseUri: 'https://flag.example' }, env, config).baseUri).toBe('https://flag.example');
    expect(resolveConnection({}, env, config).baseUri).toBe('https://env.example');
    expect(resolveConnection({}, { LD_ACCESS_TOKEN: 't' }, config).baseUri).toBe('https://config.example');
  });

  it('takes the token from --access-token over LD_ACCESS_TOKEN', () => {
    expect(resolveConnection({ accessToken: 'flag' }, { LD_ACCESS_TOKEN: 'env' }, {}).accessToken).toBe('flag');
    expect(resolveConnection({}, { LD_ACCESS_TOKEN: 'env' }, {}).accessToken).toBe('env');
  });

  it('ignores a token in the config and fails without one', () => {
    const config = { accessToken: 'from-config' } as Record<string, unknown>;
    expect(() => resolveConnection({}, {}, config)).toThrow(CodegenError);
    expect(() => resolveConnection({}, {}, config)).toThrow(/--access-token.*LD_ACCESS_TOKEN/);
  });

  it('treats an empty env var as unset', () => {
    expect(resolveConnection({}, { LD_ACCESS_TOKEN: 't', LD_BASE_URI: '' }, {}).baseUri).toBe(
      'https://app.launchdarkly.com',
    );
    expect(() => resolveConnection({}, { LD_ACCESS_TOKEN: '' }, {})).toThrow(CodegenError);
  });

  it('rejects a base URI that is not an http(s) URL', () => {
    expect(() => resolveConnection({ baseUri: 'app.launchdarkly.com' }, { LD_ACCESS_TOKEN: 't' }, {})).toThrow(
      /base URI/,
    );
  });
});
