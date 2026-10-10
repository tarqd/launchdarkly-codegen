# launchdarkly-codegen: design

A single generator that reads flag definitions from the LaunchDarkly REST API
and emits a type-safe wrapper around the official LaunchDarkly SDK for several
languages. Consumers construct their own SDK client and hand it to the
generated wrapper. The wrapper's only job is to make flag keys and value types
a compile-time concern instead of a runtime one.

Status: design, pre-implementation. `core` and the `ts-server` target have no
open decisions left; the shared design (flag model, naming, emitter interface)
has been checked against Go and Java with a compiling prototype. The full
emitter specs for `go`, `java` and `ts-browser` are later work. Facts that
could not be confirmed from a primary source are listed at the end, to be
checked during implementation.

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
  type. If schema support is added later, the likely home is a custom property
  holding a URL or inline schema, feeding a per-target type generator, with
  the method's fallback and return type narrowed to the generated type.
- Generating or baking in default values. The caller passes a fallback on
  every call, exactly as with the raw SDK. The generator never reads
  environment state.
- Constructing the SDK client, managing contexts, or wrapping non-flag APIs
  (segments, metrics, experiments).
- Running a formatter (prettier, gofmt, google-java-format). Emitters write
  canonical text and `check` compares those bytes.
- Publishing runtime helper packages. Generated code depends only on the
  official SDK; anything extra is emitted as generated code.
- Splitting a target's output by tag or view. One file (TS, Go) or one class
  (Java) per target.
- Third-party emitters.
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
| Source of truth | LaunchDarkly REST API, live at generation time, or a recorded snapshot of its responses |
| Scope of a run | one project; environments are not part of generation |
| Targets for v1 | TypeScript (Node server SDK), TypeScript (browser client SDK), Go, Java. React later. |
| Generated shape | one method per flag, plus a `...Detail` variant per flag (Go also emits `...Ctx` forms) |
| Value types | the SDK's native type per flag kind; numbers are `double` unless the flag opts into `int`; JSON flags return the SDK's JSON value type |
| Defaults | caller passes a fallback on every call |
| Flag selection | all flags in the project, or filtered by one LaunchDarkly view (by key) or by tags, never both |
| Naming | flag key converted to the language idiom; an alias set through a custom property replaces it; the generator never invents a name |
| Deprecation | flags marked deprecated get the language's deprecation annotation where one exists |
| Browser output | only flags with client-side SDK availability enabled |
| Docs | flag description becomes a doc comment, with a link to the flag in the LaunchDarkly UI, tags, and maintainer |
| Generator implementation | JavaScript/TypeScript, published as one npm package, `@launchtarqly/codegen`, runnable with `npx` |
| Configuration | config file, overridable by CLI args and environment variables; connection settings use the LaunchDarkly CLI's (`ldcli`) names |
| CI | `check` mode that fails when committed output differs from what would be generated, byte for byte |
| Runtime dependency | the official SDK only; no published helper packages |
| SDK versions | latest majors in v1; the SDK major is pinned per target in config so future majors can be added without breaking existing users |

## Architecture

```
                 ┌──────────────┐
  LD REST API ──▶│   fetcher    │──▶ raw API responses (a snapshot)
                 └──────┬───────┘
                        ▼
                 ┌──────────────┐
                 │  normalizer  │──▶ FlagModel (language-neutral)
                 └──────┬───────┘
                        ▼
          ┌─────────────┼──────────────┬──────────────┐
          ▼             ▼              ▼              ▼
    ts-server       ts-browser         go            java        (emitters)
          │             │              │              │
          ▼             ▼              ▼              ▼
     files on disk, canonical text, with a generated-file header
```

One generator, multiple targets. The fetcher and normalizer run once per
invocation; every configured target consumes the same `FlagModel`.

### Fetcher

The fetcher's output is a **snapshot**: the raw API responses for one project.
It never interprets them; that is the normalizer's job. A run either fetches
live or replays a snapshot file, and the normalizer runs the same way on both.

- Connection settings use `ldcli`'s names:

  | Setting | CLI flag | Env var | Config key | Default |
  | --- | --- | --- | --- | --- |
  | Base URI (API and UI links; EU and federal instances) | `--base-uri` | `LD_BASE_URI` | `baseUri` | `https://app.launchdarkly.com` |
  | Access token | `--access-token` | `LD_ACCESS_TOKEN` | never read from config | none |

  There are no other token fallbacks. A read-only token is enough.
- Flags come from `GET /api/v2/flags/{projectKey}` with
  `LD-API-Version: 20240415`. Without that header, older tokens get
  unpaginated responses that include environments.
- Paging is `limit`/`offset` with `limit=100` (the documented maximum),
  following `_links.next` until it is absent. Offset paging can skip or repeat
  a flag if flags change mid-fetch, so the request sorts by `key` and
  duplicates are dropped by key (first occurrence wins). The dedupe happens in
  the normalizer, not the fetcher, so a snapshot keeps the raw pages exactly
  as the API returned them.
- `env` and `expand` are never sent, so no environment data comes back. The
  API has no field selection. Archived flags are excluded by the API's
  default; deprecated flags are included.
- When a tag filter is configured, it is sent as `filter=tags:a+b`
  (URL-encoded) and the normalizer re-checks it locally, so behavior does not
  depend on server-side filter semantics.
- When a view is configured, the fetcher lists the view's members with
  `GET /api/v2/projects/{projectKey}/views/{viewKey}/linked/flags`, paged the
  same way, and the normalizer intersects them with the flags list by key.
  - The views API is beta: every views call sends `LD-API-Version: beta`, and
    the fetcher reads only `items[].resourceKey`, `totalCount` and
    `_links.next`, so changes elsewhere in the beta response can't break it.
  - Views are addressed by **key** (immutable and case-sensitive, not
    necessarily lowercase: `Team-A` is a valid key), not by name.
  - Views are an Enterprise feature. An unknown view, or an account without
    views, is exit 2.
  - The undocumented `filter=view:<key>` on the flags list is not used.
- Rate limits: on a 429, wait for `Retry-After` (seconds) if present,
  otherwise until `X-Ratelimit-Reset` / `X-Ratelimit-Auth-Token-Reset`
  (epoch milliseconds), otherwise use exponential backoff. Always add jitter
  and cap the retries; when the retries run out, exit 2.
- `--write-snapshot <file>` saves the responses, and `--from-snapshot <file>`
  replays them with no network. A snapshot is JSON with:
  - `snapshotVersion` (currently `1`; any other value is rejected),
  - `projectKey` and `baseUri`,
  - `tags`, the tag filter the flags list was fetched with (only if one was
    set),
  - `view`, the view key and its resolved member keys (only if a view was
    set),
  - `flagPages`, the raw flags-list pages in fetch order.

  Snapshots are how the normalizer and emitters are tested offline, and a
  team can pin one in CI if it wants to.

### Normalizer and the FlagModel

The flag model is intentionally small:

```ts
type FlagKind = 'boolean' | 'string' | 'number' | 'json';

interface FlagModel {
  projectKey: string;
  flags: Flag[];               // sorted by key
}

interface Flag {
  key: string;
  name: string;
  description: string;                 // missing → ""
  kind: FlagKind;
  numberType?: 'int' | 'double';       // number flags only; default 'double'
  clientSideAvailability: { usingEnvironmentId: boolean; usingMobileKey: boolean };
  tags: string[];
  maintainer?: { kind: 'member'; email: string; name?: string }
             | { kind: 'team'; key: string; name: string };
  deprecated: boolean;
  deprecationMessage?: string;
  archived: boolean;
  aliases: Partial<Record<TargetId, string>>;   // from codegen.name custom properties
  uiUrl: string;
}
```

Normalizer rules:

- **Archived** flags are dropped before emission.
- **Kind** is inferred from the variation values, the same way LaunchDarkly's
  own UI does, because LaunchDarkly's `kind` only says `boolean` or
  `multivariate`:
  - A `boolean` flag must have only boolean values; anything else is a hard
    error (exit 2) naming the flag.
  - A `multivariate` flag with only strings is `string`, with only numbers is
    `number`, and anything else is `json`.
  - Mixed values give `json` plus a warning. LaunchDarkly allows real JSON
    flags with mixed values.
  - There is no override property for kind: LaunchDarkly stores no JSON
    variation type, so value inference matches LaunchDarkly's own model.
- **Number type.** Number flags are `double` by default. The custom property
  `codegen.number` with the single value `int` makes the flag `int`. It is a
  hard error if any variation is not an integer or doesn't fit in 32 bits
  (Java's `int`). Unsigned and explicit 64-bit types are not offered: the SDKs
  have no such methods, and the wrapper stays a pass-through.
- **Client-side availability** comes from the flag's own
  `clientSideAvailability`, which is per flag and applies to every
  environment; the project's default only seeds new flags. If the field is
  absent, `usingEnvironmentId` falls back to the deprecated
  `includeInSnippet ?? false` and `usingMobileKey` to `true`.
- **Maintainer.** `_maintainer` maps to
  `{kind: 'member', email, name}`, where name is first + last. `_maintainerTeam`
  maps to `{kind: 'team', key, name}`. If neither is present, the maintainer
  is left out. List items carry both without `expand`.
- **Custom properties** always hold string arrays.
  - `codegen.name.<target>` (for example `codegen.name.go`) sets that target's
    alias; `codegen.name` sets an alias for every target that has no
    target-specific one.
  - `codegen.name.*` and `codegen.number` take exactly one non-blank value.
    More than one is a hard error naming the flag and property; an empty array
    counts as unset.
- **Deprecation.** `deprecated` is LaunchDarkly's deprecated marker OR any
  `codegen.deprecated` property. `deprecationMessage` is the non-blank
  `codegen.deprecated` values joined with a space. Both signals are kept: the
  marker (which any flag can carry) also hides the flag from LaunchDarkly's
  live list, which says something different from "don't add new calls", and
  it has no message field.
- **UI link.** `uiUrl` is `{baseUri}/projects/{projectKey}/flags/{key}`.
- **Tags** filtering, when configured, is re-applied here. A view filter keeps
  only flags whose key is among the view's members.
- The model is sorted by key so output is deterministic.

### Naming

Keys are converted per target. Each target needs a method form and a
constant form:

| Target | Method | Constant | Example from `checkout-v2.new_flow` |
| --- | --- | --- | --- |
| ts-server, ts-browser | lowerCamel | lowerCamel (`FlagKeys` property) | `checkoutV2NewFlow` |
| go | UpperCamel, exported | `Key` + UpperCamel | `CheckoutV2NewFlow`, `KeyCheckoutV2NewFlow` |
| java | lowerCamel | CONSTANT_CASE | `checkoutV2NewFlow`, `CHECKOUT_V2_NEW_FLOW` |

If the flag has an alias for the target, the alias is used as is (after
validation) instead of the converted key. Otherwise the steps are: split on
`-`, `_`, `.`, `/`, whitespace, and case changes; drop characters that are not
letters or digits; apply the target's casing. Go additionally fixes common
initialisms (`Id` to `ID`, `Url` to `URL`, `Api` to `API`), so `api-url-id`
becomes `APIURLID` and the Java constant `API_URL_ID`.

The generator never invents a name: an identifier is either the converted key
or an alias the user chose. These are errors, each naming the flag and
suggesting `codegen.name.<target>`:

- **Leading digit.** The converted key starts with a digit.
- **Reserved word.** TypeScript checks ECMAScript reserved words plus
  strict-mode reserved words. Java checks the JLS list plus the `Object`
  methods (`wait`, `notify`, `notifyAll`, `equals`, `hashCode`, `toString`,
  `getClass`, `clone`, `finalize`). Go's keywords can't collide with
  UpperCamel names, so Go checks only the names it generates itself (`New`,
  `Client`, `Flags`).
- **Collision.** The check covers every identifier a target emits: flag
  methods, their `Detail` and `Ctx` variants, and key constants. For example,
  flag `checkout`'s detail method and a flag named `checkout-detail` both want
  `CheckoutDetail`. Java would otherwise silently overload them when the
  parameter types differ. Both keys are named.

### Emitters

Each emitter implements one interface:

```ts
interface Emitter {
  id: TargetId;
  sdkMajors: readonly number[];          // config validation checks `sdkMajor` against this
  emit(model: FlagModel, cfg: TargetConfig, ctx: EmitContext): GeneratedFile[];
  summarizeChanges?(oldText: string, newText: string): string | undefined;
}

interface EmitContext {
  generatorVersion: string;              // for the file header
}
```

`sdkMajors` is the one place a target's supported SDK majors are listed;
config loading rejects any other `sdkMajor` (exit 2), so `emit` never sees
one. `summarizeChanges` is optional and only used by `check`: it reads the
file on disk and the new output back into flags (key, identifier, kind) and
returns the one-line summary from core's `summarizeFlagChanges`, or
`undefined` when the old file can't be read back, in which case `check`
prints the diff alone. Only the emitter knows its own output format, so the
parsing lives in the emitter package, not in `core` or the CLI.

Emitters are code, not text templates. The OpenFeature CLI uses Go text
templates per language, and the experience there is that templates stop being
readable once naming, reserved words, deprecation, and doc-comment escaping
all live inside them. A programmatic emitter with small per-language string
builders keeps those rules testable in isolation. A `Writer` helper handles
indentation and comment escaping so emitters do not each reinvent it.

Emitters write canonical, already-formatted text (what `prettier`, `gofmt` and
`google-java-format` would leave alone for the shapes they emit). No formatter
runs, and those bytes are what `check` compares.

Every generated file starts with a header:

```
// Code generated by launchdarkly-codegen. DO NOT EDIT.
// project: my-project   generator: 0.3.0
```

Go uses that exact first line so `go vet` and tooling recognize it as
generated. Because the generator version is in the header and `check`
compares bytes, upgrading the generator with unchanged flags reports the
output as stale until it is regenerated. That is intended: the committed
output is the contract.

### Deprecation

| Target | Annotation |
| --- | --- |
| ts-server, ts-browser | `/** @deprecated ... */` on the method |
| go | `// Deprecated: ...` paragraph in the doc comment |
| java | `@Deprecated` plus `@deprecated` Javadoc tag |

The annotation goes on the flag's method, its `Detail` and `Ctx` variants,
and its key constant. The text is the flag's `deprecationMessage`; without one,
it's a generic message naming the flag. The message has no date, so
deprecating, un-deprecating and re-deprecating doesn't churn output.

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

A team maintainer shows as `maintainer: team Payments`. The link uses the
configured base URI.

Escaping per target:

- **TS:** escape `*/`.
- **Go:** nothing to escape. The comment starts with the identifier, as Go
  convention requires (`// CheckoutV2 evaluates the "Checkout V2" flag.`),
  followed by the flag name and description.
- **Java:** Javadoc is HTML, so escape `&`, `<`, `>`, and `*/` (as `*&#47;`).
  Emit `@param` and `@return`, and comment every member, private ones
  included, so the output passes `-Xdoclint:all`.

## Generated code by target

Flag kinds map to SDK methods. The examples below use three flags:
`checkout-v2` (boolean), `pricing-tier` (string), `checkout-config` (json).

| Kind | ts-server / ts-browser | go | java |
| --- | --- | --- | --- |
| boolean | `boolVariation` → `boolean` | `BoolVariation` → `bool` | `boolVariation` → `boolean` |
| string | `stringVariation` → `string` | `StringVariation` → `string` | `stringVariation` → `String` |
| number (double) | `numberVariation` → `number` | `Float64Variation` → `float64` | `doubleVariation` → `double` |
| number (int) | `numberVariation` → `number` | `IntVariation` → `int` | `intVariation` → `int` |
| json | `jsonVariation` → `unknown` | `JSONVariation` → `ldvalue.Value` | `jsonValueVariation` → `LDValue` |

### ts-server (`@launchdarkly/node-server-sdk` v9)

The SDK's typed `...VariationDetail` methods already return
`LDEvaluationDetailTyped<T>`, so the wrapper returns them directly and needs
no helper.

```ts
import type { LDClient, LDContext, LDEvaluationDetailTyped } from '@launchdarkly/node-server-sdk';

export class Flags {
  constructor(private readonly client: LDClient) {}

  /** ... */
  checkoutV2(context: LDContext, fallback: boolean): Promise<boolean> {
    return this.client.boolVariation('checkout-v2', context, fallback);
  }
  checkoutV2Detail(context: LDContext, fallback: boolean): Promise<LDEvaluationDetailTyped<boolean>> {
    return this.client.boolVariationDetail('checkout-v2', context, fallback);
  }

  pricingTier(context: LDContext, fallback: string): Promise<string> { ... }
  pricingTierDetail(...): Promise<LDEvaluationDetailTyped<string>> { ... }

  checkoutConfig(context: LDContext, fallback: unknown): Promise<unknown> {
    return this.client.jsonVariation('checkout-config', context, fallback);
  }
  checkoutConfigDetail(...): Promise<LDEvaluationDetailTyped<unknown>> { ... }
}

export const FlagKeys = {
  checkoutV2: 'checkout-v2',
  pricingTier: 'pricing-tier',
  checkoutConfig: 'checkout-config',
} as const;
```

`FlagKeys` is emitted in every target as a cheap escape hatch for code that
needs the raw key (logging, `allFlagsState`, migrations).

### ts-browser (`@launchdarkly/js-client-sdk` v4)

The full emitter spec is later work; this records the shape the shared design
was checked against.

Same shape without the context parameter, because the client SDK evaluates
against the context given at initialization. The methods are synchronous.
Only flags with `clientSideAvailability.usingEnvironmentId` set are emitted.

```ts
export class Flags {
  constructor(private readonly client: LDClient) {}
  checkoutV2(fallback: boolean): boolean {
    return this.client.boolVariation('checkout-v2', fallback);
  }
  checkoutV2Detail(fallback: boolean): LDEvaluationDetailTyped<boolean> { ... }
}
```

`sdkMajor` picks the package: `4` is `@launchdarkly/js-client-sdk`, and `3` is
the legacy `launchdarkly-js-client-sdk`, which has only an untyped
`variation()`. Their majors don't overlap. For the legacy package the
generated code does the type check itself.

A React target (later) would emit `useCheckoutV2(fallback)` hooks on top of
`@launchdarkly/react-sdk` (v4, on js-client-sdk 4) or the legacy
`launchdarkly-react-client-sdk` (v3), and reuse the ts-browser filtering.

### go (`github.com/launchdarkly/go-server-sdk/v7`)

The full emitter spec is later work; this records the shape the shared design
was checked against.

`New` takes a generated `Client` interface listing exactly the SDK methods the
wrapper calls, `...Ctx` forms included. `*ld.LDClient` satisfies it, so
callers pass the real client unchanged and tests can pass a fake. The SDK's
own `interfaces.LDClientEvaluations` can't be used because it lacks the `Ctx`
methods. Each flag gets four methods, with the suffix order the SDK uses
(`BoolVariationDetailCtx`).

```go
// Code generated by launchdarkly-codegen. DO NOT EDIT.
package ldflags

import (
    gocontext "context"

    "github.com/launchdarkly/go-sdk-common/v3/ldcontext"
    "github.com/launchdarkly/go-sdk-common/v3/ldreason"
    "github.com/launchdarkly/go-sdk-common/v3/ldvalue"
)

// Client is the subset of *ld.LDClient the generated wrapper calls.
type Client interface {
    BoolVariation(key string, context ldcontext.Context, defaultVal bool) (bool, error)
    BoolVariationDetail(key string, context ldcontext.Context, defaultVal bool) (bool, ldreason.EvaluationDetail, error)
    BoolVariationCtx(ctx gocontext.Context, key string, context ldcontext.Context, defaultVal bool) (bool, error)
    BoolVariationDetailCtx(ctx gocontext.Context, key string, context ldcontext.Context, defaultVal bool) (bool, ldreason.EvaluationDetail, error)
    // ... one group per kind the project uses
}

// Flags is the typed wrapper.
type Flags struct{ client Client }

// New returns a Flags that evaluates through client.
func New(client Client) *Flags { return &Flags{client: client} }

// CheckoutV2 evaluates the "Checkout V2" flag. ...
func (f *Flags) CheckoutV2(context ldcontext.Context, fallback bool) (bool, error) {
    return f.client.BoolVariation(KeyCheckoutV2, context, fallback)
}

// CheckoutV2Detail ...
func (f *Flags) CheckoutV2Detail(context ldcontext.Context, fallback bool) (bool, ldreason.EvaluationDetail, error) { ... }

// CheckoutV2Ctx ...
func (f *Flags) CheckoutV2Ctx(ctx gocontext.Context, context ldcontext.Context, fallback bool) (bool, error) { ... }

// CheckoutV2DetailCtx ...
func (f *Flags) CheckoutV2DetailCtx(ctx gocontext.Context, context ldcontext.Context, fallback bool) (bool, ldreason.EvaluationDetail, error) { ... }

// CheckoutConfig ...
func (f *Flags) CheckoutConfig(context ldcontext.Context, fallback ldvalue.Value) (ldvalue.Value, error) {
    return f.client.JSONVariation(KeyCheckoutConfig, context, fallback)
}

const (
    KeyCheckoutV2     = "checkout-v2"
    KeyPricingTier    = "pricing-tier"
    KeyCheckoutConfig = "checkout-config"
)
```

The output must pass `gofmt`, `go vet` and staticcheck. go-server-sdk v7.19.0
raises the `go` directive to 1.25.0 under `go mod tidy`, so the Go compile
fixture needs Go 1.25 or later. The working prototype is on the
[`prototype/go-java-crosscheck`](https://github.com/tarqd/launchdarkly-codegen/tree/prototype/go-java-crosscheck/prototypes/go-java-crosscheck)
branch.

### java (`com.launchdarkly:launchdarkly-java-server-sdk` 7.x)

The full emitter spec is later work; this records the shape the shared design
was checked against.

```java
// Code generated by launchdarkly-codegen. DO NOT EDIT.
package com.example.flags;

import com.launchdarkly.sdk.EvaluationDetail;
import com.launchdarkly.sdk.LDContext;
import com.launchdarkly.sdk.LDValue;
import com.launchdarkly.sdk.server.interfaces.LDClientInterface;

/** ... */
public final class Flags {
  /** ... */
  private final LDClientInterface client;

  /** ... @param client ... */
  public Flags(LDClientInterface client) { this.client = client; }

  /** ... */
  public boolean checkoutV2(LDContext context, boolean fallback) {
    return client.boolVariation(Keys.CHECKOUT_V2, context, fallback);
  }
  /** ... */
  public EvaluationDetail<Boolean> checkoutV2Detail(LDContext context, boolean fallback) {
    return client.boolVariationDetail(Keys.CHECKOUT_V2, context, fallback);
  }

  /** ... */
  public LDValue checkoutConfig(LDContext context, LDValue fallback) {
    return client.jsonValueVariation(Keys.CHECKOUT_CONFIG, context, fallback);
  }

  /** ... */
  public static final class Keys {
    /** ... */
    public static final String CHECKOUT_V2 = "checkout-v2";
    ...
  }
}
```

Output is always one class. It must compile without warnings under
`-Xlint:all -Xdoclint:all -Werror`.

### No runtime packages

Generated code depends only on the official SDK. With Node SDK v9 and
js-client-sdk v4 the SDK's own types are already precise, so no helper is
needed. If a target ever needs shared helper code (for example the legacy
browser SDK's type check), it is emitted as generated code, either in the
wrapper file or as a second generated file next to it, never as a published
package that would need its own versioning against `sdkMajor`.

## Configuration

`launchdarkly-codegen.config.{json,yaml,js}` at the repo root, or `--config`.

```yaml
project: my-project
# baseUri: https://app.eu.launchdarkly.com   # default https://app.launchdarkly.com
# at most one of view or tags; neither means the whole project
view: payments            # a view key, not its display name
# tags: [checkout, billing]

targets:
  - id: ts-server
    out: services/api/src/flags.generated.ts
    sdkMajor: 9
  - id: ts-browser
    out: apps/web/src/flags.generated.ts
    sdkMajor: 4
  - id: go
    out: internal/ldflags/
    package: ldflags
    sdkMajor: 7
  - id: java
    out: services/billing/src/main/java/com/example/flags/
    package: com.example.flags
    sdkMajor: 7

check:
  # default shown
  failOnMissingOutput: true
```

A config that sets both `view` and `tags` is rejected (exit 2). That can be
loosened later without breaking anyone.

Precedence: CLI args, then environment variables, then the config file.
Generator settings use the `LD_CODEGEN_` prefix (`LD_CODEGEN_PROJECT`,
`LD_CODEGEN_VIEW`, and so on); the connection settings use `ldcli`'s names
(`LD_BASE_URI`, `LD_ACCESS_TOKEN`). The access token is never read from the
config file.

## CLI

The npm package is `@launchtarqly/codegen` and its bin is
`launchtarqly-codegen`.

```
npx @launchtarqly/codegen generate [--config path] [--target id]... [--project key] [--view key] [--tag t]...
                                   [--base-uri uri] [--access-token token] [--from-snapshot file]
npx @launchtarqly/codegen check    [same flags]      exit 1 if any target is stale
npx @launchtarqly/codegen snapshot --write-snapshot flags.json [connection and selection flags]
npx @launchtarqly/codegen init                       write a starter config
```

Each command accepts only its own flags; anything else (for example
`--write-snapshot` on `generate`) is an unknown option, exit 2.

`generate` and `check` need a config file with `targets`. `snapshot` needs
neither: it reads a config file if there is one (for `project`, `baseUri`,
`view`, `tags`), but `--project` or `LD_CODEGEN_PROJECT` and a token are
enough, and `targets` and `check` are not read.

With `--from-snapshot`, the snapshot fixes what was fetched, so the config is
checked against it:

- a configured project other than the snapshot's `projectKey` is exit 2,
  naming both;
- an explicitly set base URI (CLI, env or file, not the default) other than
  the snapshot's `baseUri` is a warning naming both, and the snapshot's
  `baseUri` is still used for UI links, so a replay stays byte-identical to
  the run that recorded it;
- a view recorded in the snapshot with configured tags, or tags recorded in
  the snapshot with a configured view, is exit 2, the same rule as `view` and
  `tags` both set in the config. A configured view must match the recorded
  one; configured tags are applied on top of recorded tags.

`check` regenerates into memory and compares with what is on disk, byte for
byte. On mismatch it prints a unified diff per file and a one-line summary of
which flags were added, removed, renamed, or changed kind. Exit codes: 0 up to
date, 1 stale, 2 configuration, model or API error. A network failure is exit
2, never 1, so a flaky API cannot masquerade as drift.

## Repository layout

```
packages/
  core/            fetcher, snapshot I/O, normalizer, FlagModel, naming, Writer, check logic
  cli/             argument parsing, config loading, orchestration; published as @launchtarqly/codegen
  emit-ts-server/
  emit-ts-browser/
  emit-go/
  emit-java/
fixtures/
  snapshots/       recorded API responses used as inputs
  golden/<target>/ expected output per snapshot
  compile/<target>/ a minimal project per language that compiles the golden output
```

Only `@launchtarqly/codegen` is published. It bundles `core` and the built-in
emitters; the other packages are private workspace packages. Emitters are
separate packages so a new target is a new package that implements `Emitter`,
plus a golden fixture and a compile fixture. The CLI discovers built-in
emitters statically.

## Testing

- Unit tests on naming (key to identifier, constant case, initialisms,
  aliases, reserved words, leading digits, collisions across every emitted
  identifier), on normalization (archived dropped, kind inference and its
  errors, `codegen.number`, single-value properties, deprecation, maintainer
  union, client-side availability fallback, tag and view filtering), and on
  `check` diffing.
- Fetcher tests against recorded responses: paging, dedupe, API-version
  headers, view resolution, rate-limit retry, and exit 2 on unknown views.
- Golden tests: each snapshot in `fixtures/snapshots` is run through every
  emitter and compared with committed output. Reviewing a change to an emitter
  means reviewing the golden diff.
- Compile tests in CI: for each target, the golden output is dropped into a
  minimal project with the pinned SDK major and compiled (`tsc --noEmit`;
  `go vet ./...` and staticcheck with Go 1.25+; `javac -Xlint:all
  -Xdoclint:all -Werror` via Gradle). These run on the CI matrix only, not on
  every local test run, since they need toolchains installed.
- One opt-in live test that runs when `LD_ACCESS_TOKEN` is set.

## Failure modes and how they are handled

| Situation | Behavior |
| --- | --- |
| Two emitted identifiers collide (methods, variants or constants) | exit 2, both keys named, suggests `codegen.name.<target>` |
| Identifier is a reserved word | exit 2, flag named, suggests `codegen.name.<target>` |
| Converted key starts with a digit | exit 2, flag named, suggests `codegen.name.<target>` |
| Boolean flag with a non-boolean value | exit 2, flag named |
| Mixed-type values on a multivariate flag | treated as `json`, warning printed |
| `codegen.number: int` on a flag with a non-integer or out-of-32-bit value | exit 2, flag and value named |
| `codegen.name.*` or `codegen.number` with more than one value | exit 2, flag and property named |
| `view` and `tags` both set (in the config, or one recorded in a replayed snapshot) | exit 2 |
| Replayed snapshot from a different project than configured | exit 2, both named |
| Replayed snapshot from a different base URI than explicitly configured | warning, both named; the snapshot's is used |
| Unknown view key, or an account without views | exit 2 |
| Flag key changes in LaunchDarkly | method name changes, consumer code fails to compile at the call site; this is the intended behavior |
| Flag kind changes | method signature changes, same as above |
| Flag archived | method disappears; `check` lists it as removed |
| Flag deleted while still referenced in code | compile error at the call site after regeneration |
| Generator upgraded with unchanged flags | `check` reports stale (exit 1) until regenerated |
| API unreachable, or retries exhausted | exit 2 with the error, never reported as drift |

## To verify during implementation

These came out of research without a primary-source confirmation. None of
them changes a decision; each has a defined behavior already.

Verified against the live API (read-only GETs, 2026-10-10):

- The server enforces `limit` ≤ 100 on the flags list: a larger `limit` is
  400 `invalid_request` ("`limit` must be less than or equal to 100").
  `_links.next.href` is root-relative and keeps `limit`, `sort` and `offset`.
- An unknown view key is 404 `{"code":"not_found","message":"View not
  found"}` on the linked-flags endpoint, also in a project with no views; an
  unknown project is 404 `Project not found`; a views call without
  `LD-API-Version: beta` is 403. View keys are case-sensitive.
- The linked-flags endpoint pages with a default `limit` of 20, a maximum of
  100 (larger is 400) and a minimum of 1. `_links.next` is present only when
  more pages follow; an offset past the end returns empty `items` and no
  `next`. Items carry only `_links`, `linkedAt`, `resourceKey` and
  `resourceType`.
- `clientSideAvailability` was present on every list item checked (19/19),
  and no `environments` field comes back. The `includeInSnippet` fallback
  stays as a guard.
- Live responses match the shape `fixtures/snapshots` assume. The opt-in
  live test records a real snapshot and checks that replaying it gives the
  same output as a live `generate`.

Still open (could not be checked without a different account or mutating
data):

- What an account without views (non-Enterprise) gets back. Any 403 from the
  views API is reported as views being unavailable (exit 2).
- How a deleted view behaves (expected to be the same 404, exit 2).

## Roadmap

1. `core` with fetcher, snapshot support, normalizer, naming, and `check`.
2. `emit-ts-server`, golden and compile fixtures, the published
   `@launchtarqly/codegen` package with its `npx` entry point. First usable
   release.
3. `emit-go`, `emit-java`.
4. `emit-ts-browser`, including legacy client SDK support via `sdkMajor`.
5. React target.
6. JSON schema typing if there is demand.
