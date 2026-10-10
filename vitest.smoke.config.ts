import { defineConfig } from 'vitest/config';

// Smoke tests pack the published CLI and install the tarball into a scratch
// project with npm. They are slow and need the npm registry, so they are
// separate from `pnpm test` and run in CI via `pnpm test:smoke`.
export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.smoke.test.ts'],
    testTimeout: 120_000,
  },
});
