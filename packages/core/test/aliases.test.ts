import { describe, expect, it } from 'vitest';
import { CodegenError, normalize, type ApiFlag } from '../src/index.js';
import { apiFlag, customProperty, snapshotOf } from './builders.js';

function aliasesOf(customProperties: ApiFlag['customProperties']) {
  return normalize(snapshotOf([apiFlag('my-flag', customProperties ? { customProperties } : {})])).flags[0]?.aliases;
}

const names = (...values: string[]) => customProperty('codegen.name', values);

describe('aliases from the codegen.name custom property', () => {
  it('has no aliases without custom properties', () => {
    expect(aliasesOf(undefined)).toEqual({});
  });

  it('treats an empty array as unset', () => {
    expect(aliasesOf(names())).toEqual({});
  });

  it('uses a ts-server: value for ts-server only', () => {
    expect(aliasesOf(names('ts-server:serverName'))).toEqual({ 'ts-server': 'serverName' });
  });

  it('uses a value without a target for every target without a target-specific value', () => {
    expect(aliasesOf(names('ts-server:serverName', 'shared', 'go:GoName'))).toEqual({
      'ts-server': 'serverName',
      'ts-browser': 'shared',
      go: 'GoName',
      java: 'shared',
      dotnet: 'shared',
    });
  });

  it('uses the alias as is', () => {
    expect(aliasesOf(names('ts-server:Weird_Name'))).toEqual({ 'ts-server': 'Weird_Name' });
  });

  it('rejects two values for the same target', () => {
    expect(() => aliasesOf(names('go:A', 'go:B'))).toThrow(
      new CodegenError('flag my-flag: custom property codegen.name has more than one value for go'),
    );
  });

  it('rejects two values without a target', () => {
    expect(() => aliasesOf(names('a', 'b'))).toThrow(
      new CodegenError('flag my-flag: custom property codegen.name has more than one value without a target ("a" and "b")'),
    );
  });

  it('rejects an unknown target, listing the known ones', () => {
    expect(() => aliasesOf(names('rust:Name'))).toThrow(
      new CodegenError(
        'flag my-flag: custom property codegen.name value "rust:Name" names unknown target "rust" (known targets: ts-server, ts-browser, go, java, dotnet)',
      ),
    );
  });

  it.each(['  ', 'go:', 'go:  '])('rejects the blank name in %j', (value) => {
    expect(() => aliasesOf(names(value))).toThrow(
      new CodegenError(`flag my-flag: custom property codegen.name value "${value}" must not have a blank name`),
    );
  });

  it('rejects the old codegen.name.<target> keys, saying how to move them', () => {
    expect(() => aliasesOf(customProperty('codegen.name.go', ['GoName']))).toThrow(
      new CodegenError(
        'flag my-flag: custom property codegen.name.go is not supported; add the value go:<name> to codegen.name instead',
      ),
    );
  });
});
