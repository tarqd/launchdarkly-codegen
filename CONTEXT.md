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

**Flag kind**:
The value type of a flag: boolean, string, number or JSON. Inferred from the flag's variation values, the same way LaunchDarkly itself infers it.
_Avoid_: variation type, flag type (LaunchDarkly's own `kind` only distinguishes boolean from multivariate)

**Maintainer**:
The member or team accountable for a flag in LaunchDarkly. A member is identified by email; a team by its key and name.
_Avoid_: owner

**Deprecated flag**:
A flag whose generated accessor carries the target's deprecation annotation. Set by LaunchDarkly's own deprecated marker or by the `codegen.deprecated` custom property, which can also supply the message.
_Avoid_: archived (archived flags are not generated at all)

**Base URI**:
The root URL of the LaunchDarkly instance a project lives on, used both for API calls and for links to flags in the UI. Named after the LaunchDarkly CLI's setting.
_Avoid_: base URL, host, server

**Alias**:
An identifier the user chooses for a flag in one target (or all targets), set through the `codegen.name` custom properties. Required whenever the converted key is reserved, starts with a digit, or collides with another generated name; the generator never invents a name itself.
_Avoid_: name override, rename

**Flag name**:
A flag's identifier in one target: its alias, or its key converted to the target's casing. The generator checks it and builds every other name for the flag from it.
_Avoid_: primary identifier

**Derived name**:
Any other identifier a target emits for a flag, built from its flag name: a `Detail` or `Ctx` method, a key constant. Checked like the flag name and included in the collision check.
_Avoid_: variant (for key constants)

**Read-back**:
Reading a target's generated text back into flags (key, identifier, kind), so `check` can summarize what changed in a stale file. The old side is whatever is on disk, so read-back parses text rather than trusting a flag model, and a file it can't read gets the diff alone.
_Avoid_: reverse emit, decompile

**Target option**:
A config key one target has beyond `id`, `out` and `sdkMajor`, such as go's `package` or dotnet's `namespace`. Its emitter declares it, with a description and example, and config loading parses it.
_Avoid_: emitter option, setting (settings are the top-level keys that env and CLI can also set)
