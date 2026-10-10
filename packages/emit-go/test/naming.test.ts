import { describe, expect, it } from 'vitest';
import { CodegenError, type Flag, type FlagModel } from '@launchtarqly/core';
import { goEmitter } from '../src/index.js';
import { modelFlag } from '../../core/test/builders.js';

const cfg = { id: 'go', out: 'internal/ldflags/flags_gen.go', sdkMajor: 7, package: 'ldflags' } as const;
const ctx = { generatorVersion: '0.3.0' };

function emit(...flags: Flag[]): string {
  const model: FlagModel = { projectKey: 'my-project', flags };
  return goEmitter.emit(model, cfg, ctx)[0]!.contents;
}

const suggestion = 'set the custom property codegen.name.go';

describe('go naming', () => {
  it('upper-cases the ADR 0002 initialisms in methods and key constants', () => {
    const out = emit(modelFlag('api-url-id'), modelFlag('banner-ids'));
    expect(out).toContain('func (f *Flags) APIURLID(context ldcontext.Context');
    expect(out).toContain('func (f *Flags) APIURLIDDetailCtx(ctx gocontext.Context');
    expect(out).toContain('KeyAPIURLID  = "api-url-id"');
    // `ids` is not an initialism, only `id` is.
    expect(out).toContain('func (f *Flags) BannerIds(context ldcontext.Context');
  });

  it('uses the go alias as is, without initialisms', () => {
    const out = emit(modelFlag('user-id', { aliases: { go: 'UserIdentifier', 'ts-server': 'uid' } }));
    expect(out).toContain('func (f *Flags) UserIdentifier(context ldcontext.Context');
    expect(out).toContain('KeyUserIdentifier = "user-id"');
    expect(out).not.toContain('UserID');
  });

  it('accepts a non-ASCII alias that starts with an upper-case letter', () => {
    expect(emit(modelFlag('ok-flag', { aliases: { go: 'Ünïcode日本' } }))).toContain('func (f *Flags) Ünïcode日本(');
  });

  it('fails on a converted key with a leading digit', () => {
    expect(() => emit(modelFlag('2fa-enabled'))).toThrow(
      new CodegenError(`flag 2fa-enabled: go identifier "2faEnabled" starts with a digit; ${suggestion} to choose a name`),
    );
  });

  it.each([
    ['a lowercase alias', 'checkout'],
    ['an alias in a script without case', '日本'],
    ['an underscore start', '_Checkout'],
    ['a space', 'Check out'],
    ['a hyphen', 'Check-Out'],
  ])('fails on %s, which is not an exported Go identifier', (_name, alias) => {
    expect(() => emit(modelFlag('ok-flag', { aliases: { go: alias } }))).toThrow(
      new CodegenError(
        `flag ok-flag: go identifier ${JSON.stringify(alias)} is not an exported Go identifier (it must start with an upper-case letter); ${suggestion} to choose a name`,
      ),
    );
  });

  it.each([
    ['Detail', 'checkout-detail', 'CheckoutDetail'],
    ['Ctx', 'checkout-ctx', 'CheckoutCtx'],
    ['DetailCtx', 'checkout-detail-ctx', 'CheckoutDetailCtx'],
  ])("fails when a flag's %s method collides with another flag, naming both", (_form, other, identifier) => {
    expect(() => emit(modelFlag('checkout'), modelFlag(other))).toThrow(
      new CodegenError(
        `go identifier "${identifier}" is produced by flags checkout and ${other}; ${suggestion} on one of them`,
      ),
    );
  });

  it("fails when a flag's name collides with another flag's Key constant", () => {
    expect(() => emit(modelFlag('checkout'), modelFlag('key-checkout'))).toThrow(
      /go identifier "KeyCheckout" is produced by flags checkout and key-checkout; set the custom property codegen\.name\.go on one of them/,
    );
  });

  it('fails when two keys convert to the same name', () => {
    expect(() => emit(modelFlag('user-id'), modelFlag('user_ID'))).toThrow(/"UserID" is produced by flags user-id and user_ID/);
  });

  it.each(['Client', 'Flags', 'New'])('fails when a flag is named %s, a name the generator uses', (name) => {
    expect(() => emit(modelFlag(name.toLowerCase()))).toThrow(
      new CodegenError(
        `flag ${name.toLowerCase()}: go identifier "${name}" collides with a name the generator uses; ${suggestion} to choose a name`,
      ),
    );
  });

  it('checks an alias against the names the generator uses', () => {
    expect(() => emit(modelFlag('constructor', { aliases: { go: 'New' } }))).toThrow(
      /flag constructor: go identifier "New" collides with a name the generator uses/,
    );
  });
});
