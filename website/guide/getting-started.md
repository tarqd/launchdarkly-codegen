# Getting started

The generator runs from npm with `npx`; there is nothing to add to your
application's dependencies. Generated code depends only on the official
LaunchDarkly SDK you already use. It needs Node 22 or later.

## 1. Write a config

In your repository root:

```sh
npx @launchtarqly/codegen init
```

This writes `launchdarkly-codegen.config.yaml`:

```yaml
project: my-project
# baseUri: https://app.eu.launchdarkly.com   # default https://app.launchdarkly.com

targets:
  - id: ts-server
    out: src/flags.generated.ts
    sdkMajor: 9
```

Set `project` to your LaunchDarkly project key and list one target per
language you want output for. See [Targets](/targets/) for each target's keys
and [Configuration](/reference/configuration) for everything else.

## 2. Give it an access token

The generator reads flags through the LaunchDarkly REST API, so it needs an
[API access token](https://docs.launchdarkly.com/home/account/api) with read
access to the project. The token is never read from the config file:

```sh
export LD_ACCESS_TOKEN=api-xxxxxxxx
```

or pass `--access-token`. The variable name is the same one the LaunchDarkly
CLI (`ldcli`) uses.

## 3. Generate

```sh
npx @launchtarqly/codegen generate
```

```
wrote src/flags.generated.ts
```

Commit the generated files. Run `generate` again whenever flags change in
LaunchDarkly, and add [`check`](/guide/ci) to CI to catch when you forget.

## 4. Use the wrapper

You construct the SDK client as usual and hand it to the generated class.
Every flag becomes a method that takes a context and a fallback of the flag's
type, plus a `Detail` variant that returns the evaluation reason:

```ts
import { init } from '@launchdarkly/node-server-sdk';
import { Flags } from './flags.generated.js';

const client = init(process.env.LD_SDK_KEY!);
const flags = new Flags(client);

if (await flags.checkoutV2(context, false)) {
  // ...
}
const tier: string = await flags.pricingTier(context, 'free');
```

Each target also emits its flag keys as constants (`FlagKeys` in TypeScript
and .NET, `Key…` constants in Go, `Flags.Keys` in Java) for code that needs
the raw key.

## Choosing which flags to generate

By default every non-archived flag in the project is generated. To narrow it,
set **one** of:

- `view`: a LaunchDarkly view key; only the view's flags are generated.
- `tags`: a list of tags; only flags with those tags are generated.

Setting both is an error. Both can also come from the environment
(`LD_CODEGEN_VIEW`, `LD_CODEGEN_TAGS`) or the CLI (`--view`, `--tag`).

## Next steps

- [Checking output in CI](/guide/ci)
- [Flag properties](/guide/flag-properties): naming, integer flags and deprecation from LaunchDarkly
- [CLI reference](/reference/cli)
