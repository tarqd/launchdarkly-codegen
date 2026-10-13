# Checking output in CI

`check` regenerates every target in memory and compares the result with what
is on disk, byte for byte. It writes nothing.

```sh
npx @launchtarqly/codegen check
```

| Exit code | Meaning |
|---|---|
| `0` | Every target is up to date. |
| `1` | At least one target is stale. |
| `2` | Configuration, flag model or API error. |

A network failure is exit 2, never 1, so a flaky API can't be mistaken for
drift.

When a file is stale, `check` prints a unified diff and a one-line summary of
which flags were added, removed, renamed or changed kind:

```
flags: 1 added (a), 1 renamed (b: bOld → bNew)
```

A configured output file that doesn't exist yet counts as stale. To allow
that, set `check.failOnMissingOutput: false` in the config.

## GitHub Actions

Store an API access token as a repository secret and run `check` on pull
requests:

```yaml
name: flags
on: [pull_request]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npx @launchtarqly/codegen check
        env:
          LD_ACCESS_TOKEN: ${{ secrets.LD_ACCESS_TOKEN }}
```

## Offline runs with snapshots

A snapshot is the raw LaunchDarkly API responses for one project, saved to a
file. `generate` and `check` can replay one instead of calling the API, which
needs no token and gives the same bytes every time:

```sh
# with network access and a token
npx @launchtarqly/codegen snapshot --write-snapshot flags.snapshot.json

# anywhere, without a token
npx @launchtarqly/codegen check --from-snapshot flags.snapshot.json
```

The snapshot fixes what was fetched, so the config is checked against it: a
different `project` is an error, and a different base URI is a warning (the
snapshot's base URI is still used for links, so output matches the recording
run).
