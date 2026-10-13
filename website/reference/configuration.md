# Configuration

The generator looks for one of these in the current directory, or takes a
path with `--config`:

- `launchdarkly-codegen.config.json`
- `launchdarkly-codegen.config.yaml`
- `launchdarkly-codegen.config.js`

Relative `out` paths are resolved against the config file's directory.

```yaml
project: my-project
# default https://app.launchdarkly.com
# baseUri: https://app.eu.launchdarkly.com
# at most one of view or tags; neither means the whole project
view: payments            # a view key, not its display name
# tags: [checkout, billing]

targets:
  - id: ts-server
    out: services/api/src/flags.generated.ts
    sdkMajor: 9
  - id: go
    out: internal/ldflags/flags_gen.go
    package: ldflags
    sdkMajor: 7
  - id: java
    out: services/billing/src/main/java/com/example/flags/
    package: com.example.flags
    sdkMajor: 7
  - id: dotnet
    out: src/Billing/FeatureFlags/Flags.g.cs
    namespace: Billing.FeatureFlags
    sdkMajor: 8

check:
  # default shown
  failOnMissingOutput: true
```

## Settings

Settings can come from CLI flags, environment variables or the config file,
in that order of precedence. A list setting is a repeatable flag, a
comma-separated environment variable, or a list in the file.

| Config key | CLI flag | Environment variable | Default |
|---|---|---|---|
| `project` | `--project` | `LD_CODEGEN_PROJECT` | |
| `baseUri` | `--base-uri` | `LD_BASE_URI` | `https://app.launchdarkly.com` |
| `accessToken` (not read from the file) | `--access-token` | `LD_ACCESS_TOKEN` | |
| `view` | `--view` | `LD_CODEGEN_VIEW` | |
| `tags` | `--tag` | `LD_CODEGEN_TAGS` | |

`view` and `tags` can't both be set. The access token is never read from the
config file; putting it there is a warning and the value is ignored.
`baseUri` is the root of your LaunchDarkly instance, such as
`https://app.eu.launchdarkly.com`, and is used for API calls and for links in
doc comments.

## Targets

`targets` is a list. Every target has:

| Key | Description |
|---|---|
| `id` | Which target: `ts-server`, `go`, `java` or `dotnet`. |
| `out` | Where to write. A file or a directory, depending on the target. |
| `sdkMajor` | The SDK major version to generate for. |

and the options its target declares. Any other key is an error.

| Target | `out` | Option | Description | Example |
|---|---|---|---|---|
| `ts-server` | a `.ts`, `.mts` or `.cts` file | none | | |
| `dotnet` | a `.cs` file | `namespace` (required) | The generated classes' namespace: dotted C# identifiers, none a keyword, not ending in Flags or FlagKeys. | `MyApp.FeatureFlags` |
| `go` | a `.go` file | `package` (required) | The generated file's Go package name: a lowercase Go identifier that is not a keyword. | `ldflags` |
| `java` | a directory | `package` (required) | The generated file's `package`: dot-separated Java identifiers, none a reserved word. | `com.example.flags` |

Every configured target is validated when the config loads, even ones
`--target` leaves out. Errors name the file and the target's position:

```
launchdarkly-codegen.config.yaml: targets[1].package is required (for example ldflags)
launchdarkly-codegen.config.yaml: targets[1]: unknown key `pakage` for go (known keys: id, out, sdkMajor, package)
```

## `check`

| Key | Default | Description |
|---|---|---|
| `failOnMissingOutput` | `true` | Whether a configured output file that doesn't exist makes `check` fail. |
