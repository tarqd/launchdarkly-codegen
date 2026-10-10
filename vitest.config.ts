import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { conditions: ['source'] },
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    exclude: ['**/*.compile.test.ts', '**/node_modules/**'],
  },
});
