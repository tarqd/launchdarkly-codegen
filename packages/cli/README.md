# @launchtarqly/codegen

Reads your feature flags from the LaunchDarkly REST API and generates a
type-safe wrapper around the official LaunchDarkly server SDK. Each flag gets a
typed accessor, so a wrong flag key or value type is a compile error, and
`check` fails CI when the generated file drifts from the project. The generated
code is a thin facade that depends only on the official SDK.

Targets:

| Target | SDK |
|---|---|
| `ts-server` | `@launchdarkly/node-server-sdk` 9 |
| `go` | `github.com/launchdarkly/go-server-sdk/v7` |
| `java` | `com.launchdarkly:launchdarkly-java-server-sdk` 7 |
| `dotnet` | `LaunchDarkly.ServerSdk` 8 |

Requires Node 22 or later.

## Usage

```sh
npx @launchtarqly/codegen init        # writes launchdarkly-codegen.config.yaml
LD_ACCESS_TOKEN=api-… npx @launchtarqly/codegen generate
LD_ACCESS_TOKEN=api-… npx @launchtarqly/codegen check   # exit 1 if a generated file is stale
```

`generate` and `check` read `launchdarkly-codegen.config.json`, `.yaml` or
`.js` from the current directory, or the file given with `--config`:

```yaml
project: my-project
targets:
  - id: ts-server
    out: src/flags.generated.ts
    sdkMajor: 9
  - id: go
    out: internal/ldflags/flags_gen.go
    package: ldflags
    sdkMajor: 7
```

The access token is never read from the config file: set `LD_ACCESS_TOKEN` or
pass `--access-token`. `snapshot --write-snapshot flags.json` records the API
responses, and `--from-snapshot flags.json` generates from them offline.

Run `npx @launchtarqly/codegen --help` for every command and flag.
The design, including each target's output, is in
[DESIGN.md](https://github.com/tarqd/launchdarkly-codegen/blob/main/DESIGN.md).
