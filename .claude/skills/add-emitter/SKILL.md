---
name: add-emitter
description: "Add a server-side SDK target to the generator: research the SDK, prototype and settle the output shape in DESIGN.md, then build the `emit-<target>` package. Use when adding, designing or building an emitter for a server-side LaunchDarkly SDK (Go, Java, Python, Ruby, .NET, …)."
---

A **target** is one language + SDK the generator writes a wrapper for. Its **emitter** turns the language-neutral Flag model into that wrapper's canonical text. Vocabulary is in `CONTEXT.md`. The rules every emitter obeys are in `DESIGN.md` → Naming, Emitters, Deprecation, Doc comments and Generated code by target. `emit-ts-server` is the reference emitter.

Below, `<id>` is the target id as configs and `codegen.name.<id>` spell it (`go`, `java`, `python`).

The work runs in two halves. The **design** half (steps 1–3) ends with the target's shape settled in `DESIGN.md`. The **build** half (step 4) follows [`BUILD.md`](BUILD.md). The emitter implements a design; building one never discovers its shape.

## 1. Research the SDK

Invoke the `research` skill. The question is the SDK's typed evaluation API for the major you will pin, taken from the SDK's source and official docs:

- the package or module coordinates and the current major;
- the client type or interface to accept;
- every typed `…Variation` / `…VariationDetail` method, with exact signatures, for boolean, string, int, double and JSON values;
- the context-propagation variants (Go's `…Ctx`), and the context type;
- the language's doc-comment syntax, its escaping rules, and its deprecation annotation;
- its reserved words and identifier grammar;
- its formatter and its strictest compile and lint settings.

If `DESIGN.md` already sketches the target (as it does for `go` and `java`), the research checks that sketch rather than starting again.

**Done when** the research file answers every bullet above with a primary source cited for each.

## 2. Prototype the output

Invoke the `prototype` skill. The design question is whether this output file compiles cleanly against the real SDK under the strictest settings from step 1. Write the sample by hand for three flags: one boolean, one string or number, one JSON. Put it in a minimal project that pins the SDK and calls every generated method, then run the toolchain.

The `prototype/go-java-crosscheck` branch already holds a Go and a Java prototype. Start from it for those two targets.

**Done when** the hand-written sample compiles with zero warnings and the formatter leaves it unchanged.

## 3. Settle the design

Invoke the `grilling` skill, using `domain-modeling` for terms and decisions. Work through each open choice with the user until it is settled. Then write the `<id>` section of `DESIGN.md` → Generated code by target. It must settle:

- the SDK package and supported majors (these become `sdkMajors`);
- the prototype from step 2, as the complete sample output;
- this target's row in the Naming table, and its reserved words;
- its rows in the Deprecation and Doc comment escaping tables, and its column in the kind → SDK method table, covering both `numberType`s (ADR 0001);
- any target-specific config keys (a Go `package`, a Java `package`);
- the compile fixture's toolchain and warning settings.

New terms go in `CONTEXT.md`. A hard-to-reverse, surprising trade-off gets an ADR in `docs/adr/`.

**Done when** the section answers every bullet above and the user has agreed to each choice.

## 4. Build

Pick the path with the user:

- **Through tickets** (recommended; ts-server took ten). Tell the user to run `/to-tickets` on the new `DESIGN.md` section, then `/implement-spec`. Each ticket should name [`BUILD.md`](BUILD.md) as its checklist. A good first ticket is a tracer bullet: wiring plus boolean flags through to a compiling golden file.
- **In this session.** Follow [`BUILD.md`](BUILD.md) here. When it is done, invoke `code-review` against `DESIGN.md` and the `<id>` section, and fix every finding.

**Done when** every item in `BUILD.md` → Finish holds on the branch.
