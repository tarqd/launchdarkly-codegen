# launchdarkly-codegen

See `DESIGN.md` for the design and `CONTEXT.md` for vocabulary.

## Development

Node 22 and pnpm 10.

```sh
pnpm install
pnpm build          # tsc -b over packages/*
pnpm typecheck      # build plus type-check of the tests
pnpm test           # unit and golden tests
pnpm test:compile   # golden output compiled against the pinned SDKs (fixtures/compile)
pnpm update-golden  # rewrite fixtures/golden from fixtures/snapshots; review the diff
```

## Releasing

Only `@launchtarqly/codegen` (`packages/cli`) is published; `core` and the
emitters are bundled into it. Releases are automated with
[release-please](https://github.com/googleapis/release-please), as in
`launchdarkly/js-core`:

1. PR titles are [Conventional Commits](https://www.conventionalcommits.org/)
   (checked by the `Lint PR title` workflow). PRs are squash-merged, with the
   PR title as the commit subject and the PR body as its body, so both reach
   `main` as one commit. `fix:` is a patch, `feat:` a minor, and
   `feat!:` or a `BREAKING CHANGE:` footer a major; while the version is 0.x a
   breaking change bumps the minor. `chore:`, `ci:`, `docs:`, `test:` and
   `refactor:` don't release.
2. On each push to `main`, release-please keeps a release PR open with the
   next version and `CHANGELOG.md`. A `Release-As: x.y.z` footer on a commit
   forces the version.
3. Merging the release PR tags `vX.Y.Z`, creates the GitHub release, and stages
   the version on npm from the `production` environment, whose `NPM_TOKEN` can
   stage but not publish.
4. A maintainer makes it live with 2FA:

   ```sh
   npm stage list @launchtarqly/codegen
   npm stage approve <stage-id>
   ```

Running the `release-please` workflow by hand takes a `task`: `release-pr`
reruns release-please (after a `BEGIN_COMMIT_OVERRIDE` edit to a merged PR's
body, say), and `publish` stages the selected ref, to redo a failed publish on
the release tag (it defaults to a dry run). In Claude Code, `/release-me`
checks the commits since the last release and gets the release PR ready.
