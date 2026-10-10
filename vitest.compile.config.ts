import { defineConfig } from 'vitest/config';

// Compile tests drop golden output into fixtures/compile/<target> and run that
// target's compiler. They need toolchains installed, so they are separate from
// `pnpm test` and run in CI via `pnpm test:compile`.
export default defineConfig({
  resolve: { conditions: ['source'] },
  ssr: { resolve: { conditions: ['source'] } },
  test: {
    include: ['packages/*/test/**/*.compile.test.ts'],
    testTimeout: 120_000,
  },
});
