# launchdarkly-codegen: design

A single generator that reads flag definitions from the LaunchDarkly REST API
and emits a type-safe wrapper around the official LaunchDarkly SDK for several
languages. Consumers construct their own SDK client and hand it to the
generated wrapper. The wrapper's only job is to make flag keys and value types
a compile-time concern instead of a runtime one.

Status: design, pre-implementation. Decisions below came out of a design
interview; open items are collected at the end.

## Goals

- Catch wrong flag keys and wrong value types at compile time in TypeScript,
  Go and Java.
- One tool, one config, many targets. A monorepo runs the generator once and
  gets output for every language it uses.
- Stay out of the evaluation path. The wrapper is a thin facade; the SDK does
  all the work, and the wrapper adds no caching, no network, no new defaults.
- Be safe to run in CI. A `check` mode fails the build when committed output
  drifts from the project.

## Non-goals (for v1)

- Narrowing string or number flags to the set of variations currently defined.
  Variations can be added at runtime, so string flags stay `string`.
- Typing JSON flags from a schema. JSON flags return the SDK's native value
  type. Schema support is a possible later addition.
- Generating or baking in default values. The caller passes a fallback on
  every call, exactly as with the raw SDK. The generator never reads
  environment state.
- Constructing the SDK client, managing contexts, or wrapping non-flag APIs
  (segments, metrics, experiments).
- Replacing the official SDKs or the OpenFeature CLI. See prior art.

## Prior art

| Tool | Source of truth | Shape | Languages | Notes |
| --- | --- | --- | --- | --- |
| OpenFeature CLI | `flags.json` manifest | typed accessors over an OpenFeature client, templates per language | Go, Java, C#, TS, Python, React | closest structural analog; manifest-driven, not API-driven; alpha |
| launchdarkly-typegen | LaunchDarkly API | TS interface of flag keys and types, no methods | TS | third-party |
| Flipt Typed | `features.yml` | TS types | TS | experimental |
| Vercel Flags SDK | code | flags declared in code with `flag()` and a provider adapter, no generation | TS | the opposite approach |
| LaunchDarkly SDK wrapper guide | n/a | describes the facade we are generating | n/a | guidance, not a tool |

Consensus across the tools that generate code: consumer brings the client, the
generated code is a facade on top. We follow that.

## Core decisions

| Question | Decision |
| --- | --- |
| Source of truth | LaunchDarkly REST API, live at generation time |
| Scope of a run | one project; environments are not part of generation |
| Targets for v1 | TypeScript (Node server SDK), TypeScript (browser client SDK), Go, Java. React later. |
| Generated shape | one method per flag, plus a `...Detail` variant per flag |
| Value types | the SDK's native type per flag kind; JSON flags return the SDK's JSON value type |
| Defaults | caller passes a fallback on every call |
| Flag selection | all flags in the project, or filtered by a LaunchDarkly view or by tags |
| Naming | flag key converted to the language idiom; a per-language custom property on the flag overrides the name |
| Deprecation | flags marked deprecated get the language's deprecation annotation where one exists |
| Browser output | only flags with client-side SDK availability enabled |
| Docs | flag description becomes a doc comment, with a link to the flag in the LaunchDarkly UI, tags, and maintainer |
| Generator implementation | JavaScript/TypeScript, runnable with `npx` |
| Configuration | config file, overridable by CLI args and environment variables |
| CI | `check` mode that fails when committed output is stale |
| Runtime dependency | generated code depends on the official SDK plus a small published runtime helper per language |
| SDK versions | latest majors in v1; the SDK major is pinned per target in config so future majors can be added without breaking existing users |

## Architecture

```
                 ┌──────────────┐
  LD REST API ──▶│   fetcher    │──▶ raw flags, views, tags
                 └──────┬───────┘
                        ▼
                 ┌──────────────┐
                 │  normalizer  │──▶ FlagModel (language-neutral IR)
                 └──────┬───────┘
                        ▼
          ┌─────────────┼──────────────┬──────────────┐
          ▼             ▼              ▼              ▼
    ts-server       ts-browser         go            java        (emitters)
          │             │              │              │
          ▼             ▼              ▼              ▼
     files on disk, formatted, with a generated-file header and a model hash
```

One generator, multiple targets. The fetcher and normalizer run once per
invocation; every configured target consumes the same `FlagModel`.

### Fetcher

- Reads `GET /api/v2/flags/{projectKey}` with pagination, requesting the
  fields the model needs (key, name, description, kind, variations,
  client-side availability, tags, maintainer, archived, deprecated, custom
  properties). Environment-specific fields are not requested.
- When a view filter is configured, resolves the view to its flag set through
  the views API and intersects.
- When a tag filter is configured, passes it as the API filter and also
  re-checks locally so behavior does not depend on server-side filter
  semantics.
- Auth from `LD_API_TOKEN` (or `LAUNCHDARKLY_ACCESS_TOKEN`, checked in that
  order), or from `--token`. Never from the config file.
- Respects rate-limit headers with bounded retry.
- Can be bypassed with `--from-snapshot <file>` and populated with
  `--write-snapshot <file>` so the normalizer and emitters can be tested
  offline and so a team can pin a known model in CI if they want to.

### Normalizer and the FlagModel

The intermediate representation is intentionally small:

```ts
type FlagKind = 'boolean' | 'string' | 'number' | 'json';

interface FlagModel {
  projectKey: string;
  fetchedAt: string;           // excluded from the hash
  flags: Flag[];
}

interface Flag {
  key: string;
  name: string;
  description: string;
  kind: FlagKind;
  clientSideAvailability: { usingEnvironmentId: boolean; usingMobileKey: boolean };
  tags: string[];
  maintainer?: { email: string; name?: string };
  deprecated: boolean;
  archived: boolean;
  nameOverrides: Partial<Record<TargetId, string>>;   // from custom properties
  uiUrl: string;
}
```

Normalizer rules:

- Archived flags are dropped before emission.
- `kind` is derived from the flag's variation type; a flag whose variations are
  not all one JSON type is `json`.
- Name overrides come from custom properties named
  `codegen.name.<target>` (for example `codegen.name.go`), with
  `codegen.name` as a fallback for all targets.
- `deprecated` is true when the flag has LaunchDarkly's deprecated marker or
  the custom property `codegen.deprecated` is set.
- The model is sorted by key so output is deterministic. A SHA-256 of the
  canonical model, excluding `fetchedAt`, is written into every generated file
  header and is what `check` compares.

### Naming

Keys are converted per target:

| Target | Method | Example from `checkout-v2.new_flow` |
| --- | --- | --- |
| ts-server, ts-browser | lowerCamel | `checkoutV2NewFlow` |
| go | UpperCamel, exported | `CheckoutV2NewFlow` |
| java | lowerCamel | `checkoutV2NewFlow` |

Rules applied in order: split on `-`, `_`, `.`, `/`, whitespace, and
case changes; drop characters that are not letters or digits; prefix with
`flag` (or `Flag`) when the first character is a digit; apply the target's
casing; then check against the target's reserved words and append `Flag` on
collision. If two flags produce the same identifier the run fails with both
keys named; the fix is a `codegen.name.<target>` override on one of them.

Go additionally fixes common initialisms (`Id` to `ID`, `Url` to `URL`, `Api`
to `API`) to satisfy `golint`-style conventions. Java reserved words are
checked against the JLS list; TypeScript against ECMAScript reserved words
plus strict-mode reserved words.

### Emitters

Each emitter implements one interface:

```ts
interface Emitter {
  id: TargetId;
  emit(model: FlagModel, cfg: TargetConfig): GeneratedFile[];
}
```

Emitters are code, not text templates. The OpenFeature CLI uses Go text
templates per language, and the experience there is that templates stop being
readable once naming, reserved words, deprecation, and doc-comment escaping
all live inside them. A programmatic emitter with small per-language string
builders keeps those rules testable in isolation. A `Writer` helper handles
indentation and comment escaping so emitters do not each reinvent it.

Every generated file starts with a header:

```
// Code generated by launchdarkly-codegen. DO NOT EDIT.
// project: my-project   model: sha256:3f2a…   generator: 0.3.0
```

Go uses that exact first line so `go vet` and tooling recognize it as
generated.

Output is run through the language's formatter when available on the host
(`prettier` bundled for TS, `gofmt` if on PATH, `google-java-format` if on
PATH), and emitted unformatted otherwise. The emitter writes canonical,
already-formatted text so the formatter is a safety net rather than a
requirement, and `check` compares against formatted output when the formatter
ran.

### Deprecation

| Target | Annotation |
| --- | --- |
| ts-server, ts-browser | `/** @deprecated ... */` on the method |
| go | `// Deprecated: ...` line in the doc comment |
| java | `@Deprecated` plus `@deprecated` Javadoc tag |

The deprecation text comes from the custom property `codegen.deprecated` if
it holds a string, otherwise a generic message naming the flag.

### Doc comments

Each method gets a doc comment built from the flag's name, description, and
a trailer with the key, tags, maintainer, and the UI link:

```ts
/**
 * Checkout V2
 *
 * Routes eligible users to the rewritten checkout flow.
 *
 * key: `checkout-v2` · tags: checkout, q3 · maintainer: ada@example.com
 * https://app.launchdarkly.com/projects/my-project/flags/checkout-v2
 */
```

Description text is escaped for the target comment syntax (`*/` in
TS/Java, nothing special in Go).

## Generated code by target

Flag kinds map to SDK methods. The example below uses three flags:
`checkout-v2` (boolean), `pricing-tier` (string), `checkout-config` (json).

### ts-server (`@launchdarkly/node-server-sdk` v9)

```ts
import type { LDClient, LDContext, LDEvaluationDetail } from '@launchdarkly/node-server-sdk';
import type { LDFlagValue } from '@launchdarkly/node-server-sdk';
import { TypedDetail, detail } from '@launchdarkly/codegen-runtime-node';

export class Flags {
  constructor(private readonly client: LDClient) {}

  /** ... */
  checkoutV2(context: LDContext, fallback: boolean): Promise<boolean> {
    return this.client.boolVariation('checkout-v2', context, fallback);
  }
  checkoutV2Detail(context: LDContext, fallback: boolean): Promise<TypedDetail<boolean>> {
    return detail(this.client.boolVariationDetail('checkout-v2', context, fallback));
  }

  pricingTier(context: LDContext, fallback: string): Promise<string> { ... }
  pricingTierDetail(...): Promise<TypedDetail<string>> { ... }

  checkoutConfig(context: LDContext, fallback: LDFlagValue): Promise<LDFlagValue> {
    return this.client.jsonVariation('checkout-config', context, fallback);
  }
  checkoutConfigDetail(...): Promise<TypedDetail<LDFlagValue>> { ... }
}

export const FlagKeys = {
  checkoutV2: 'checkout-v2',
  pricingTier: 'pricing-tier',
  checkoutConfig: 'checkout-config',
} as const;
```

`FlagKeys` is emitted in every target as a cheap escape hatch for code that
needs the raw key (logging, `allFlagsState`, migrations).

### ts-browser (`@launchdarkly/js-client-sdk` v3)

Same shape without the context parameter, because the client SDK evaluates
against the context given at initialization. Only flags with
`clientSideAvailability.usingEnvironmentId` set are emitted.

```ts
export class Flags {
  constructor(private readonly client: LDClient) {}
  checkoutV2(fallback: boolean): boolean {
    return this.client.boolVariation('checkout-v2', fallback);
  }
  checkoutV2Detail(fallback: boolean): TypedDetail<boolean> { ... }
}
```

The `sdkMajor` setting selects between the current `@launchdarkly/js-client-sdk`
API and the legacy `launchdarkly-js-client-sdk` package, which only exposes an
untyped `variation()`. For the legacy package the runtime helper performs the
type check.

A React target (later) would emit `useCheckoutV2(fallback)` hooks on top of
`@launchdarkly/react-client-sdk` and reuse the ts-browser filtering.

### go (`github.com/launchdarkly/go-server-sdk/v7`)

```go
// Code generated by launchdarkly-codegen. DO NOT EDIT.
package ldflags

import (
    ld "github.com/launchdarkly/go-server-sdk/v7"
    "github.com/launchdarkly/go-sdk-common/v3/ldcontext"
    "github.com/launchdarkly/go-sdk-common/v3/ldreason"
    "github.com/launchdarkly/go-sdk-common/v3/ldvalue"
)

type Flags struct{ client *ld.LDClient }

func New(client *ld.LDClient) *Flags { return &Flags{client: client} }

// CheckoutV2 ...
func (f *Flags) CheckoutV2(ctx ldcontext.Context, fallback bool) (bool, error) {
    return f.client.BoolVariation("checkout-v2", ctx, fallback)
}

func (f *Flags) CheckoutV2Detail(ctx ldcontext.Context, fallback bool) (bool, ldreason.EvaluationDetail, error) {
    return f.client.BoolVariationDetail("checkout-v2", ctx, fallback)
}

func (f *Flags) CheckoutConfig(ctx ldcontext.Context, fallback ldvalue.Value) (ldvalue.Value, error) {
    return f.client.JSONVariation("checkout-config", ctx, fallback)
}

const (
    KeyCheckoutV2     = "checkout-v2"
    KeyPricingTier    = "pricing-tier"
    KeyCheckoutConfig = "checkout-config"
)
```

Go's SDK already returns detail as a separate value, so the Go emitter needs
no runtime helper for detail. The struct holds an interface rather than
`*ld.LDClient` if the config sets `clientInterface: true`, to make mocking
easier.

### java (`com.launchdarkly:launchdarkly-java-server-sdk` 7.x)

```java
// Code generated by launchdarkly-codegen. DO NOT EDIT.
package com.example.flags;

import com.launchdarkly.sdk.EvaluationDetail;
import com.launchdarkly.sdk.LDContext;
import com.launchdarkly.sdk.LDValue;
import com.launchdarkly.sdk.server.interfaces.LDClientInterface;

public final class Flags {
  private final LDClientInterface client;
  public Flags(LDClientInterface client) { this.client = client; }

  /** ... */
  public boolean checkoutV2(LDContext context, boolean fallback) {
    return client.boolVariation("checkout-v2", context, fallback);
  }
  public EvaluationDetail<Boolean> checkoutV2Detail(LDContext context, boolean fallback) {
    return client.boolVariationDetail("checkout-v2", context, fallback);
  }

  public LDValue checkoutConfig(LDContext context, LDValue fallback) {
    return client.jsonValueVariation("checkout-config", context, fallback);
  }

  public static final class Keys {
    public static final String CHECKOUT_V2 = "checkout-v2";
    ...
  }
}
```

Java output is one class by default. A `splitBy: tag` option emits one class
per tag (`CheckoutFlags`, `BillingFlags`) for projects with hundreds of flags,
where a single class becomes unpleasant to navigate. Go output is one package;
Go files split by first tag with the same option.

### Runtime helper packages

Published per language and kept deliberately tiny:

| Package | Contents |
| --- | --- |
| `@launchdarkly/codegen-runtime-node` | `TypedDetail<T>`, `detail()` to narrow `LDEvaluationDetail` |
| `@launchdarkly/codegen-runtime-browser` | same, plus a type-checked `variation()` shim for the legacy client SDK |
| Go | none needed in v1 |
| Java | none needed in v1 |

Rationale: TypeScript's SDK detail types are untyped on `value`, and
repeating the narrowing in every generated method is noise. Where the SDK is
already typed (Go, Java) the generated code depends only on the SDK. Each
runtime package pins the SDK major it was built against, and the generator
checks that the configured `sdkMajor` matches.

## Configuration

`launchdarkly-codegen.config.{json,yaml,js}` at the repo root, or `--config`.

```yaml
project: my-project
# exactly one of view or tags, or neither for the whole project
view: payments
# tags: [checkout, billing]

targets:
  - id: ts-server
    out: services/api/src/flags.generated.ts
    sdkMajor: 9
  - id: ts-browser
    out: apps/web/src/flags.generated.ts
    sdkMajor: 3
  - id: go
    out: internal/ldflags/
    package: ldflags
    sdkMajor: 7
    clientInterface: true
  - id: java
    out: services/billing/src/main/java/com/example/flags/
    package: com.example.flags
    sdkMajor: 7
    splitBy: tag

check:
  # defaults shown
  failOnMissingOutput: true
  ignoreFormatting: false
```

Precedence: CLI args, then environment variables (`LD_CODEGEN_PROJECT`,
`LD_CODEGEN_VIEW`, and so on), then the config file. The API token is never
read from the config file.

## CLI

```
npx launchdarkly-codegen generate [--config path] [--target id]... [--project key] [--view name] [--tag t]...
npx launchdarkly-codegen check    [same flags]      exit 1 if any target is stale
npx launchdarkly-codegen snapshot --write-snapshot flags.json
npx launchdarkly-codegen init                        write a starter config
```

`check` regenerates into memory and compares with what is on disk, byte for
byte after formatting. On mismatch it prints a unified diff per file and a
one-line summary of which flags were added, removed, renamed, or changed
kind. Exit codes: 0 up to date, 1 stale, 2 configuration or API error. A
network failure is exit 2, never 1, so a flaky API cannot masquerade as drift.

## Repository layout

```
packages/
  core/            fetcher, normalizer, FlagModel, naming, Writer, check logic
  cli/             argument parsing, config loading, orchestration; the npx entry point
  emit-ts-server/
  emit-ts-browser/
  emit-go/
  emit-java/
  runtime-node/    published helper
  runtime-browser/ published helper
fixtures/
  model/           snapshot FlagModels used as inputs
  golden/<target>/ expected output per model
  compile/<target>/ a minimal project per language that compiles the golden output
```

Emitters are separate packages so a new target is a new package that
implements `Emitter`, plus a golden fixture and a compile fixture. The CLI
discovers built-in emitters statically; third-party emitters are out of scope
for v1 but the interface is the extension point if that changes.

## Testing

- Unit tests on naming (key to identifier, reserved words, collisions,
  initialisms), on normalization (archived dropped, kind inference, override
  properties), and on `check` diffing.
- Golden tests: each fixture model is run through every emitter and compared
  with committed output. Reviewing a change to an emitter means reviewing the
  golden diff.
- Compile tests in CI: for each target, the golden output is dropped into a
  minimal project with the pinned SDK major and compiled (`tsc --noEmit`,
  `go vet ./...`, `javac` via Gradle). These run on the CI matrix only, not
  on every local test run, since they need toolchains installed.
- Fetcher tests against recorded API responses, plus one opt-in live test
  that runs when `LD_API_TOKEN` is set.

## Failure modes and how they are handled

| Situation | Behavior |
| --- | --- |
| Two flags normalize to the same identifier | run fails, both keys named, suggests `codegen.name.<target>` |
| Identifier is a reserved word | `Flag` suffix appended, noted in `--verbose` |
| Flag key changes in LaunchDarkly | method name changes, consumer code fails to compile at the call site; this is the intended behavior |
| Flag kind changes | method signature changes, same as above |
| Flag archived | method disappears; `check` lists it as removed |
| Flag deleted while still referenced in code | compile error at the call site after regeneration |
| Mixed-type variations on a non-JSON flag | treated as `json`, warning printed |
| API unreachable in `check` | exit 2 with the error, never reported as drift |
| Formatter missing on host | output written unformatted, warning printed; `check` compares unformatted |

## Open questions

1. **Runtime helper scope.** The decision was to allow a small published
   runtime helper per language. The design above uses it only where the SDK's
   own types force boilerplate (TypeScript). If publishing and versioning
   those packages turns out to cost more than the boilerplate saves, the
   fallback is to emit the helper as a second generated file next to the
   wrapper. Worth revisiting after the TS emitter exists.
2. **Views API shape.** The fetcher design assumes a view resolves to a flag
   set through the API. Confirm the endpoint and pagination behavior before
   building the view filter, and decide what happens when a view and tags are
   both set (proposal: reject the config).
3. **Deprecation signal.** LaunchDarkly's own deprecated marker versus the
   `codegen.deprecated` custom property. The design honors both; confirm the
   first one exists in the API response for flags and is not environment
   scoped.
4. **Per-environment client-side availability.** Client-side availability is
   project level in the current API, which is what makes the browser filter
   possible without an environment. Verify this holds for projects created
   before the project-level setting existed.
5. **JSON schema support.** Deferred. If added, the likely home is a custom
   property holding a URL or inline schema, feeding a per-target type
   generator, with the method's fallback and return type narrowed to the
   generated type.
6. **Formatting policy.** Bundling `prettier` is cheap; bundling `gofmt` and
   `google-java-format` is not. The design falls back to canonical emitter
   output. Decide whether `check` should fail when a formatter is configured
   but missing.

## Roadmap

1. `core` with fetcher, normalizer, naming, snapshot support, and `check`.
2. `emit-ts-server` and `runtime-node`, golden and compile fixtures, `npx`
   entry point. First usable release.
3. `emit-go`, `emit-java`.
4. `emit-ts-browser` and `runtime-browser`, including legacy client SDK
   support via `sdkMajor`.
5. React target.
6. JSON schema typing if there is demand.
