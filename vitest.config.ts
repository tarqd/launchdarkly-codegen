import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { conditions: ['source'] },
  // Vitest resolves node-environment imports through Vite's SSR resolver,
  // which ignores `resolve.conditions`; without this, tests run on stale dist.
  ssr: { resolve: { conditions: ['source'] } },
  test: {
    include: ['packages/*/test/**/*.test.ts', 'scripts/**/*.test.mjs'],
    exclude: ['**/*.compile.test.ts', '**/*.smoke.test.ts', '**/node_modules/**'],
  },
});
