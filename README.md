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
   (checked by the `Lint PR title` workflow), and PRs are squash-merged so the
   title is the commit on `main`. `fix:` is a patch, `feat:` a minor, and
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

To redo a failed publish, run the `release-please` workflow by hand on the
release tag (it defaults to a dry run).
