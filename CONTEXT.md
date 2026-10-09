# launchdarkly-codegen

Turns a LaunchDarkly project's flag definitions into type-safe wrappers around
the official LaunchDarkly SDKs, one per language the consumer uses.

## Language

**Generator**:
The whole tool: one invocation that reads a project's flags and writes output for every configured target.
_Avoid_: codegen (as a noun for the tool), compiler

**Target**:
A language and SDK pairing the user asks for in config, such as `ts-server` or `go`. The user-facing unit of output.
_Avoid_: language, platform, emitter (in user-facing text)

**Emitter**:
The internal component that produces one target's files. Internal vocabulary only; users configure targets, never emitters.
_Avoid_: generator, template, backend

**Snapshot**:
The raw LaunchDarkly API responses for one project, saved to a file so a run can replay them without network access. The normalizer still runs on a snapshot.
_Avoid_: model dump, fixture (for the raw responses)

**Flag model**:
The language-neutral form of a project's flags that every target is generated from, derived from a snapshot or live fetch.
_Avoid_: IR, schema, manifest
