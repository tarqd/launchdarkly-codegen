# Building an emitter

The build checklist for the [`add-emitter`](SKILL.md) skill. It assumes the `<id>` section of `DESIGN.md` → Generated code by target is settled; that section is the spec this file builds against. Mirror `emit-ts-server` file for file.

## Wiring

Each of these sites must name the new target. Copy the `emit-ts-server` entry at each one:

- `packages/core/src/model.ts` `TargetId` and `packages/core/src/aliases.ts` `TARGET_IDS`, unless `<id>` is already there (`ts-browser`, `go` and `java` are).
- `packages/emit-<id>/` with `package.json` (private; the same `exports` conditions with `source` first; `@launchtarqly/core: workspace:*`), `tsconfig.json` referencing `../core`, `src/index.ts` and `test/`.
- The root `tsconfig.json` `references`. The `packages/cli/tsconfig.json` `references`.
- The `packages/cli/package.json` `devDependencies`. Emitters are bundled into the published CLI, so a runtime dependency of the emitter must be a dependency esbuild can bundle.
- `packages/cli/src/emitters.ts` `BUILT_IN_EMITTERS`.

Then run `pnpm install`.

**Done when** `pnpm typecheck` passes and config accepts `id: <id>`. The emitter can still be a stub at this point.

## The emitter

Invoke the `tdd` skill. Each item below is a behaviour with its own failing test, in `packages/emit-<id>/test/`:

- **Naming.** Run every name through `flagIdentifier(flag, <id>, convert)`, so aliases win. Collect **every** identifier the file emits into `checkIdentifiers`: each flag's method marked `primary`, its `Detail`/`Ctx` variants, its key constant, and the emitter's own names with no `flagKey` (`Flags`, `New`, `Client`, `client`). Give it the target's own reserved-word set and identifier `pattern`.
- **Shared converters.** Converters that more than one target will need (UpperCamel, CONSTANT_CASE, Go initialisms) belong in `packages/core/src/naming.ts` next to `lowerCamel`. Invoke `codebase-design` to keep that module deep, and test the converters there.
- **Kinds.** Map all four kinds to the SDK's typed method. For number flags, `numberType` chooses between `int` and `double`.
- **Doc comments and deprecation.** Use `Writer.docComment(lines, escape)` with this target's escape function, or `line` comments for line-comment languages. Put the deprecation annotation on the method, every variant and the key constant.
  A target whose formatter reflows comments (java, ADR 0004) may use its own doc helper instead of `Writer.docComment`, so the comments come out already in the formatter's layout.
- **Header.** Construct `new Writer({ indent, commentPrefix })` with the language's indent unit and comment prefix, then call `w.header(...)`. `GENERATED_MARKER` is already the exact line Go tooling recognizes.
- **Target options.** `parseTargets` passes extra keys through unchecked. The emitter validates its own keys and throws `CodegenError` naming the key, which exits 2.
- **`summarizeChanges`.** Parse the emitter's own output back into `GeneratedFlag`s in `src/flag-changes.ts` and return core's `summarizeFlagChanges`. Return `undefined` when the text can't be read back. Test it against every golden file, as `emit-ts-server/test/flag-changes.test.ts` does.

Keep these invariants:

- `emit` is pure.
- `emit` relies on config having already checked `sdkMajor` against `sdkMajors`.
- Output is canonical: byte-for-byte what the language's formatter would leave alone. No formatter runs, and `check` compares bytes.
- Generated code imports only the official SDK. Any helper is emitted into the generated files, never published as a package.
- The generator never invents a name: every naming failure tells the user to set `codegen.name.<id>`.

**Done when** each item above has a test that went red and then green.

## Golden output

Add `{ id: '<id>', ext, extra }` to `TARGETS` in `packages/cli/test/golden.test.ts`. `extra` holds `sdkMajor` plus any required target options. Run `pnpm update-golden`. That writes `fixtures/golden/<id>/<snapshot>.<ext>` for **every** snapshot in `fixtures/snapshots/`.

The golden test also requires empty stderr. So a case that warns (mixed-kind values, for example) belongs in an emitter or CLI test, not in a snapshot.

**Done when** you have read every new golden file against the `DESIGN.md` sample and it matches line for line. Reviewing an emitter means reviewing its golden diff.

## Compile fixture and CI

- `fixtures/compile/<id>/` is the step 2 prototype project, cut down to a minimal fixture that pins the SDK major and calls the generated API for every kind. `pnpm-workspace.yaml` globs `fixtures/compile/*`, so a non-Node fixture must not contain a `package.json`.
- `packages/emit-<id>/test/<id>.compile.test.ts`, modelled on the ts-server one, copies each golden file into the fixture and runs the strict checks from `DESIGN.md`. For a language with a formatter, also assert the golden output is already formatted (for example, `gofmt -l` prints nothing). The test needs the toolchain on the PATH; check that it's installed (`which go java javac gradle`) and run the test locally.
- CI does two things:
  - It runs `pnpm test:compile 'packages/emit-<id>/'`, selecting the compile test by its package path. Don't filter with `-t '<id>'`: it matches test names as substrings, so `-t go` also runs every suite whose name contains "golden".
  - It needs `<id>` in the `compile` job matrix in `.github/workflows/ci.yml`, plus a toolchain setup step guarded by `if: matrix.target == '<id>'` (for example `actions/setup-go`, or `actions/setup-java` + Gradle).

When a compile test goes red and the cause isn't obvious from the compiler output, invoke `diagnosing-bugs`.

**Done when** `pnpm test:compile 'packages/emit-<id>/'` passes locally and the matrix lists `<id>`.

## Finish

- `DESIGN.md`: the `<id>` section describes what was built, no longer "later work". Update the Roadmap line as well.
- `packages/cli/src/init.ts`: add the target to the starter config only if the user wants it there.
- `pnpm typecheck`, `pnpm test`, `pnpm test:compile` and `pnpm test:smoke` all pass.
- `git status` shows the fixtures and golden files committed.
