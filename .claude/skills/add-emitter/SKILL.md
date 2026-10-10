---
name: add-emitter
description: "Add a server-side SDK target to the generator: a new `emit-<target>` package, golden and compile fixtures, and the CLI/CI wiring. Use when adding, scaffolding or building an emitter for a server-side LaunchDarkly SDK (Go, Java, Python, Ruby, .NET, …)."
---

A **target** is one language + SDK the generator writes a wrapper for. Its **emitter** turns the language-neutral Flag model into that wrapper's canonical text. `emit-ts-server` is the reference emitter: mirror its shape file for file, and read it before writing anything. Vocabulary is in `CONTEXT.md`. The rules every emitter obeys live in `DESIGN.md` → Naming, Emitters, Deprecation, Doc comments and Generated code by target. This skill points there and doesn't restate them.

Below, `<id>` is the target id as configs and `codegen.name.<id>` spell it (`go`, `java`, `python`).

## 1. Pin the target's shape in DESIGN.md

The emitter implements a design. It doesn't discover one. `DESIGN.md` → Generated code by target must have a section for `<id>` that settles all of the following:

- the SDK package and the supported majors (these become `sdkMajors`);
- a complete sample of the output file;
- this target's row in the Naming table (method and constant casing), plus its reserved words;
- its rows in the Deprecation and Doc comment escaping tables, and its column in the kind → SDK method table, covering both `numberType`s (ADR 0001);
- any target-specific config keys (a Go `package`, a Java `package`);
- the compile fixture's toolchain and its strictest warning settings.

Check every SDK method name and signature in the sample against the SDK source for the pinned major. Don't rely on memory. If `go` and `java` are only sketches, or there's no section yet, draft the missing parts and settle them with the user (the `grilling` skill fits) before writing any code.

**Done when** the section answers every bullet above, and the user has agreed to any part you drafted.

## 2. Wire the package in

Each of these sites must name the new target. Copy the `emit-ts-server` entry at each one:

- `packages/core/src/model.ts` `TargetId` and `packages/core/src/aliases.ts` `TARGET_IDS`, unless `<id>` is already there (`ts-browser`, `go` and `java` are).
- `packages/emit-<id>/` with `package.json` (private; the same `exports` conditions with `source` first; `@launchtarqly/core: workspace:*`), `tsconfig.json` referencing `../core`, `src/index.ts` and `test/`.
- The root `tsconfig.json` `references`. The `packages/cli/tsconfig.json` `references`.
- The `packages/cli/package.json` `devDependencies`. Emitters are bundled into the published CLI, so a runtime dependency of the emitter must be a dependency esbuild can bundle.
- `packages/cli/src/emitters.ts` `BUILT_IN_EMITTERS`.

Then run `pnpm install`.

**Done when** `pnpm typecheck` passes and config accepts `id: <id>`. The emitter can still be a stub at this point.

## 3. Build the emitter test-first

Invoke the `tdd` skill. Each item below is a behaviour with its own failing test, in `packages/emit-<id>/test/`:

- **Naming.** Run every name through `flagIdentifier(flag, <id>, convert)`, so aliases win. Collect **every** identifier the file emits into `checkIdentifiers`: each flag's method marked `primary`, its `Detail`/`Ctx` variants, its key constant, and the emitter's own names with no `flagKey` (`Flags`, `New`, `Client`, `client`). Give it the target's own reserved-word set and identifier `pattern`. Converters that more than one target will need (UpperCamel, CONSTANT_CASE, Go initialisms) belong in `packages/core/src/naming.ts` next to `lowerCamel`, with their own tests there.
- **Kinds.** Map all four kinds to the SDK's typed method. For number flags, `numberType` chooses between `int` and `double`.
- **Doc comments and deprecation.** Use `Writer.docComment(lines, escape)` with this target's escape function, or `line` comments for line-comment languages. Put the deprecation annotation on the method, every variant and the key constant.
- **Header.** Construct `new Writer({ indent, commentPrefix })` with the language's indent unit and comment prefix, then call `w.header(...)`. `GENERATED_MARKER` is already the exact line Go tooling recognizes.
- **Target options.** `parseTargets` passes extra keys through unchecked. The emitter validates its own keys and throws `CodegenError` naming the key, which exits 2.
- **`summarizeChanges`.** Parse the emitter's own output back into `GeneratedFlag`s in `src/flag-changes.ts` and return core's `summarizeFlagChanges`. Return `undefined` when the text can't be read back. Test it against every golden file, as `emit-ts-server/test/flag-changes.test.ts` does.

Keep these invariants:

- `emit` is pure.
- `emit` relies on config having already checked `sdkMajor` against `sdkMajors`.
- Output is canonical: byte-for-byte what the language's formatter would leave alone. No formatter runs, and `check` compares bytes.
- Generated code imports only the official SDK. Any helper is emitted into the generated files, never published as a package.
- The generator never invents a name: every naming failure tells the user to set `codegen.name.<id>`.

**Done when** each bullet has a test that went red and then green.

## 4. Golden output

Add `{ id: '<id>', ext, extra }` to `TARGETS` in `packages/cli/test/golden.test.ts`. `extra` holds `sdkMajor` plus any required target options. Run `pnpm update-golden`. That writes `fixtures/golden/<id>/<snapshot>.<ext>` for **every** snapshot in `fixtures/snapshots/`.

The golden test also requires empty stderr. So a case that warns (mixed-kind values, for example) belongs in an emitter or CLI test, not in a snapshot.

**Done when** you have read every new golden file against the `DESIGN.md` sample and it matches line for line. Reviewing an emitter means reviewing its golden diff.

## 5. Compile fixture and CI

- `fixtures/compile/<id>/` is a minimal project that pins the SDK major and includes usage code that calls the generated API for every kind. `pnpm-workspace.yaml` globs `fixtures/compile/*`, so a non-Node fixture must not contain a `package.json`.
- `packages/emit-<id>/test/<id>.compile.test.ts`, modelled on the ts-server one, copies each golden file into the fixture and runs the toolchain's strict checks from step 1. For a language with a formatter, also assert the golden output is already formatted (for example, `gofmt -l` prints nothing). The test needs the toolchain on the PATH; check that it's installed (`which go java javac gradle`) and run the test locally.
- CI does two things:
  - It runs `pnpm test:compile -t '<id>'`, so the compile test's `describe` name must contain `<id>`.
  - It needs `<id>` in the `compile` job matrix in `.github/workflows/ci.yml`, plus a toolchain setup step guarded by `if: matrix.target == '<id>'` (for example `actions/setup-go`, or `actions/setup-java` + Gradle).

**Done when** `pnpm test:compile -t '<id>'` passes locally and the matrix lists `<id>`.

## 6. Finish

- `DESIGN.md`: the `<id>` section describes what was built, no longer "later work". Update the Roadmap line as well.
- `CONTEXT.md`: add any new domain term.
- `packages/cli/src/init.ts`: add the target to the starter config only if the user wants it there.

**Done when** `pnpm typecheck`, `pnpm test`, `pnpm test:compile` and `pnpm test:smoke` all pass, and `git status` shows the fixtures and golden files committed.
