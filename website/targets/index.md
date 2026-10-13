# Targets

A target is a language and SDK pair. List one per language in `targets`.

| Target | SDK | `sdkMajor` | Output |
|---|---|---|---|
| [`ts-server`](./ts-server) | `@launchdarkly/node-server-sdk` | `9` | one `.ts` file |
| [`go`](./go) | `github.com/launchdarkly/go-server-sdk/v7` | `7` | one `.go` file |
| [`java`](./java) | `com.launchdarkly:launchdarkly-java-server-sdk` | `7` | `Flags.java` in a directory |
| [`dotnet`](./dotnet) | `LaunchDarkly.ServerSdk` | `8` | one `.cs` file |

Every target generates, for each flag, a method taking a context and a
fallback of the flag's type, a `Detail` variant returning the evaluation
reason, and a key constant. The examples on each page are the generator's
real output for a project with one flag of each kind, taken from the test
fixtures, so they always match the current release.

Client-side targets (`ts-browser`, React) are planned.
