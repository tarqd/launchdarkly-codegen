# CLI

The npm package is `@launchtarqly/codegen` and its command is
`launchtarqly-codegen`. Run it with `npx`:

```sh
npx @launchtarqly/codegen <command> [flags]
```

Each command accepts only its own flags; anything else is an error (exit 2).

## `generate`

Fetches the project's flags and writes every configured target.

```
launchtarqly-codegen generate [--config path] [--target id]... [--project key] [--view key | --tag t...]
                              [--base-uri uri] [--access-token token] [--from-snapshot file]
```

| Flag | Description |
|---|---|
| `--config path` | Config file to use instead of searching the current directory. |
| `--target id` | Only generate this target; repeat for several. Every configured target is still validated. |
| `--from-snapshot file` | Replay a [snapshot](/guide/ci#offline-runs-with-snapshots) instead of calling the API. No token needed. |
| `--project`, `--view`, `--tag`, `--base-uri`, `--access-token` | Override [settings](/reference/configuration#settings). |

## `check`

Takes the same flags as `generate`, regenerates in memory, and compares with
the files on disk. Writes nothing. See [Checking output in CI](/guide/ci).

| Exit code | Meaning |
|---|---|
| `0` | Up to date. |
| `1` | At least one target is stale. |
| `2` | Configuration, model or API error. |

## `snapshot`

Fetches the project's flags and saves the raw API responses to a file, for
later `--from-snapshot` runs.

```
launchtarqly-codegen snapshot --write-snapshot file [--config path] [--project key]
                              [--view key | --tag t...] [--base-uri uri] [--access-token token]
```

`snapshot` doesn't need a config file: `--project` (or `LD_CODEGEN_PROJECT`)
and a token are enough. If there is a config file, only its `project`,
`baseUri`, `view` and `tags` are read.

## `init`

Writes a starter config, `launchdarkly-codegen.config.yaml`, or the path given
with `--config`. It never overwrites an existing config.

```
launchtarqly-codegen init [--config path]
```

## Exit codes

Every command exits `0` on success and `2` on any error. Only `check` uses `1`.
