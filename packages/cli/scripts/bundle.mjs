// Bundles the CLI with `core` and the built-in emitters inlined, so the
// published @launchtarqly/codegen has no dependency on the private workspace
// packages (DESIGN.md → Repository layout). Runs on `prepack`; the result in
// bundle/ is the only code in the tarball. Node built-ins stay external.
import { build } from 'esbuild';
import { rm } from 'node:fs/promises';

const outdir = new URL('../bundle/', import.meta.url).pathname;
await rm(outdir, { recursive: true, force: true });
await build({
  absWorkingDir: new URL('..', import.meta.url).pathname,
  entryPoints: {
    'launchtarqly-codegen': 'src/main.ts',
    index: 'src/index.ts',
  },
  outdir,
  bundle: true,
  // One file per entry: shared code is duplicated rather than split into chunks.
  splitting: false,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  conditions: ['source'],
  packages: 'bundle',
  legalComments: 'none',
  logLevel: 'warning',
});
