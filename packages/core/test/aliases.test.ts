import { describe, expect, it } from 'vitest';
import { CodegenError, normalize, type ApiFlag, type Snapshot } from '../src/index.js';

function flagWithProperties(customProperties: ApiFlag['customProperties']): ApiFlag {
  return {
    key: 'my-flag',
    name: 'My flag',
    kind: 'boolean',
    variations: [{ value: true }, { value: false }],
    archived: false,
    deprecated: false,
    tags: [],
    ...(customProperties ? { customProperties } : {}),
  };
}

function snapshot(flag: ApiFlag): Snapshot {
  return {
    snapshotVersion: 1,
    projectKey: 'my-project',
    baseUri: 'https://app.launchdarkly.com',
    flagPages: [{ items: [flag] }],
  };
}

function aliasesOf(customProperties: ApiFlag['customProperties']) {
  return normalize(snapshot(flagWithProperties(customProperties))).flags[0]?.aliases;
}

describe('aliases from codegen.name custom properties', () => {
  it('has no aliases without custom properties', () => {
    expect(aliasesOf(undefined)).toEqual({});
  });

  it('uses codegen.name.ts-server for ts-server only', () => {
    expect(aliasesOf({ 'codegen.name.ts-server': { name: 'TS name', value: ['serverName'] } })).toEqual({
      'ts-server': 'serverName',
    });
  });

  it('uses codegen.name for every target without a target-specific alias', () => {
    expect(
      aliasesOf({
        'codegen.name': { name: 'Name', value: ['shared'] },
        'codegen.name.ts-server': { name: 'TS name', value: ['serverName'] },
      }),
    ).toEqual({ 'ts-server': 'serverName', 'ts-browser': 'shared', go: 'shared', java: 'shared' });
  });

  it('treats an empty array as unset, so the fallback applies', () => {
    expect(
      aliasesOf({
        'codegen.name': { name: 'Name', value: ['shared'] },
        'codegen.name.ts-server': { name: 'TS name', value: [] },
      }),
    ).toMatchObject({ 'ts-server': 'shared' });
  });

  it('uses the alias as is', () => {
    expect(aliasesOf({ 'codegen.name.ts-server': { name: 'n', value: ['Weird_Name'] } })).toEqual({
      'ts-server': 'Weird_Name',
    });
  });

  it('rejects more than one value, naming the flag and property', () => {
    expect(() => aliasesOf({ 'codegen.name.ts-server': { name: 'n', value: ['a', 'b'] } })).toThrow(
      new CodegenError('flag my-flag: custom property codegen.name.ts-server must have exactly one value, got 2'),
    );
  });

  it('rejects more than one value on the fallback property', () => {
    expect(() => aliasesOf({ 'codegen.name': { name: 'n', value: ['a', 'b'] } })).toThrow(
      new CodegenError('flag my-flag: custom property codegen.name must have exactly one value, got 2'),
    );
  });

  it('rejects a blank value', () => {
    expect(() => aliasesOf({ 'codegen.name': { name: 'n', value: ['  '] } })).toThrow(
      new CodegenError('flag my-flag: custom property codegen.name must not be blank'),
    );
  });
});
