import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ApiFlag } from '@launchtarqly/core';
import { apiFlag, customProperty } from '../../core/test/builders.js';
import { projectDir, runCli, writeSnapshot } from './helpers.js';

const config = {
  project: 'my-project',
  targets: [{ id: 'java', out: 'gen', package: 'com.example.flags', sdkMajor: 7 }],
};

async function generate(...items: ApiFlag[]) {
  const dir = await projectDir(config);
  const result = await runCli(['generate', '--from-snapshot', await writeSnapshot(dir, items)], dir);
  return { ...result, dir };
}

const named = (key: string, names: Record<string, string>): ApiFlag =>
  apiFlag(key, {
    customProperties: Object.assign({}, ...Object.entries(names).map(([prop, value]) => customProperty(prop, [value]))),
  });

describe('java names', () => {
  it('prefers the java alias, then the all-target alias, then the converted key', async () => {
    const { exitCode, stderr, dir } = await generate(
      named('flag-one', { 'codegen.name.java': 'myAlias', 'codegen.name': 'sharedAlias' }),
      named('flag-two', { 'codegen.name': 'sharedTwo', 'codegen.name.ts-server': 'tsTwo' }),
      apiFlag('checkout-v2.new_flow'),
      apiFlag('api-url-id'),
    );
    expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: '' });
    const text = await readFile(join(dir, 'gen/Flags.java'), 'utf8');
    expect(text).toContain('public boolean myAlias(LDContext context, boolean fallback) {');
    expect(text).toContain('public EvaluationDetail<Boolean> myAliasDetail(LDContext context, boolean fallback) {');
    expect(text).toContain('return client.boolVariation(Keys.MY_ALIAS, context, fallback);');
    expect(text).toContain('public static final String MY_ALIAS = "flag-one";');
    expect(text).not.toContain('sharedAlias');
    expect(text).toContain('public boolean sharedTwo(LDContext context, boolean fallback) {');
    expect(text).toContain('public static final String SHARED_TWO = "flag-two";');
    expect(text).not.toContain('tsTwo');
    expect(text).toContain('public boolean checkoutV2NewFlow(LDContext context, boolean fallback) {');
    expect(text).toContain('public static final String CHECKOUT_V2_NEW_FLOW = "checkout-v2.new_flow";');
    expect(text).toContain('public static final String API_URL_ID = "api-url-id";');
  });
});

// Each naming rule is tested in packages/emit-java/test/naming.test.ts; these check the CLI's exit code and message.
describe('java naming failures exit 2 and suggest codegen.name.java', () => {
  async function expectFailure(items: ApiFlag[], ...fragments: string[]) {
    const result = await generate(...items);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('codegen.name.java');
    for (const fragment of fragments) expect(result.stderr).toContain(fragment);
  }

  it('a leading digit', () =>
    expectFailure([apiFlag('2fa-enabled')], 'flag 2fa-enabled: java identifier "2faEnabled" starts with a digit'));

  it('a constant collision', () =>
    expectFailure(
      [apiFlag('api-url-id'), named('other-flag', { 'codegen.name.java': 'apiURLId' })],
      'java identifier "API_URL_ID" is produced by flags api-url-id and other-flag',
    ));
});
