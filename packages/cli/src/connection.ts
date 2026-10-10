/**
 * Connection settings (DESIGN.md → Fetcher), with `ldcli`'s names:
 * base URI from `--base-uri` > `LD_BASE_URI` > config `baseUri` > default;
 * access token from `--access-token` > `LD_ACCESS_TOKEN`, never from config.
 */

import { CodegenError } from '@launchtarqly/core';

export const DEFAULT_BASE_URI = 'https://app.launchdarkly.com';

export interface Connection {
  baseUri: string;
  accessToken: string;
}

export function resolveConnection(
  flags: { baseUri?: string | undefined; accessToken?: string | undefined },
  env: Record<string, string | undefined>,
  config: { baseUri?: string },
): Connection {
  const baseUri = first(flags.baseUri, env.LD_BASE_URI, config.baseUri) ?? DEFAULT_BASE_URI;
  if (!/^https?:\/\/[^/]/.test(baseUri)) {
    throw new CodegenError(`base URI must be an http(s) URL, got ${JSON.stringify(baseUri)}`);
  }
  const accessToken = first(flags.accessToken, env.LD_ACCESS_TOKEN);
  if (accessToken === undefined) {
    throw new CodegenError(
      'no LaunchDarkly access token: pass --access-token or set LD_ACCESS_TOKEN (or use --from-snapshot <file>)',
    );
  }
  return { baseUri: baseUri.replace(/\/+$/, ''), accessToken };
}

function first(...values: (string | undefined)[]): string | undefined {
  return values.find((v) => v !== undefined && v !== '');
}
