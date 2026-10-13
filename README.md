# launchdarkly-codegen

User docs: https://tarqd.github.io/launchdarkly-codegen/ (source in `website/`).
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
pnpm docs:dev       # docs site (VitePress) with live reload
```
