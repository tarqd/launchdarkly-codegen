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
| Targets for v1 | TypeScript (Node server SDK), TypeScript (browser client SDK), Go, Java, .NET. React later. |
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
| dotnet | UpperCamel | UpperCamel (`FlagKeys` constant) | `CheckoutV2NewFlow`, `FlagKeys.CheckoutV2NewFlow` |

If the flag has an alias for the target, the alias is used as is (after
validation) instead of the converted key. Otherwise the steps are: split on
`-`, `_`, `.`, `/`, whitespace, and case changes; drop characters that are not
letters or digits; apply the target's casing. Go additionally upper-cases
staticcheck's 42 default initialisms (`Id` to `ID`, `Url` to `URL`, `Api` to
`API`, `Http` to `HTTP`, …; ADR 0002), so `api-url-id` becomes `APIURLID` and
the Java constant `API_URL_ID`. .NET follows the Framework Design Guidelines
instead (`Api`, `Url`, `Id`), so it applies no initialism table: `api-url-id`
becomes `ApiUrlId`.

The generator never invents a name: an identifier is either the converted key
or an alias the user chose. These are errors, each naming the flag and
suggesting `codegen.name.<target>`:

- **Leading digit.** The converted key starts with a digit.
- **Reserved word.** TypeScript checks ECMAScript reserved words plus
  strict-mode reserved words. Java checks the 51 JLS reserved keywords
  (`_` included), the literals `true`, `false` and `null`, `yield` (legal to
  declare but never callable unqualified), and the `Object` methods (`wait`,
  `notify`, `notifyAll`, `equals`, `hashCode`, `toString`, `getClass`,
  `clone`, `finalize`). Go's keywords can't collide with
  UpperCamel names, so Go checks only the names it generates itself (`New`,
  `Client`, `Flags`), and requires every identifier, aliases included, to
  match `^\p{Lu}[\p{L}\p{Nd}_]*$`: an exported name must start with an
  upper-case letter, so an alias like `checkout` or `日本` is an error. C#
  keywords are all lowercase too, so .NET checks its own names (`Flags`,
  `FlagKeys`; a member can't share its class's name, CS0542) and the
  `System.Object` members (`Equals`, `GetHashCode`, `ToString`, `GetType`,
  `MemberwiseClone`, `Finalize`, `ReferenceEquals`). An alias, which can be
  in any case, is also checked against the C# keywords. The generator never
  escapes a name with `@`.
- **Collision.** The check covers every identifier a target emits: flag
  methods, their `Detail` variants (and Go's `Ctx` variants), and key
  constants. For example, flag `checkout`'s detail method and a flag named
  `checkout-detail` both want `CheckoutDetail`. Java would otherwise silently
  overload them when the parameter types differ. Both keys are named.

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

Go uses that exact first line, which matches `^// Code generated .* DO NOT
EDIT\.$`, so staticcheck, gopls and `go/ast.IsGenerated` recognize the file as
generated. Because the generator version is in the header and `check`
compares bytes, upgrading the generator with unchanged flags reports the
output as stale until it is regenerated. That is intended: the committed
output is the contract.

### Deprecation

| Target | Annotation |
| --- | --- |
| ts-server, ts-browser | `/** @deprecated ... */` on the method |
| go | `// Deprecated: ...` paragraph in the doc comment |
| java | bare `@Deprecated` plus `@deprecated` Javadoc tag, always as a pair (`since` and `forRemoval` need Java 9) |
| dotnet | `[System.Obsolete(...)]`, with `DiagnosticId = "LDFLAG001"` and the flag's UI link as `UrlFormat` on .NET 5+ (ADR 0003) |

The annotation goes on the flag's method, its `Detail` variant (and Go's
`Ctx` variants), and its key constant. The text is the flag's
`deprecationMessage`; without one, it's a generic message naming the flag.
The message has no date, so deprecating, un-deprecating and re-deprecating doesn't churn output.

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
- **Go:** nothing needs escaping (`*/` is harmless in `//` comments), but
  gofmt rewrites doc comments, so the name and description are sanitized
  instead (Generated code by target → go). The comment starts with the
  identifier, as Go convention requires (`// CheckoutV2 evaluates the
  "Checkout V2" flag.`), followed by the description.
- **Java:** Javadoc is HTML and Javadoc tags start with `@`, so escape `&` →
  `&amp;`, `<` → `&lt;`, `>` → `&gt;`, `*/` → `*&#47;`, `\` → `&#92;` (javac
  reads `\u` as a unicode escape even inside comments), and `@` → `&#64;`
  where it starts a word or follows `{` (so `@since` and `{@code` stay text,
  while `ada@example.com` stays readable). The key goes in `{@code …}`
  unescaped, since keys only use letters, digits, `.`, `_` and `-`. Emit
  `@param` and `@return`, and comment every member, private ones included, so
  the output passes `-Xdoclint:all`.
- **.NET:** `///` XML doc comments, so escape `&`, `<` and `>`, and `"` in
  attribute values. Emit `<param>` and `<returns>` and document every public
  member, so `GenerateDocumentationFile` raises no CS1591. In an
  `[Obsolete]` `UrlFormat` string, `{` and `}` are doubled.

## Generated code by target

Flag kinds map to SDK methods. The examples below use three flags:
`checkout-v2` (boolean), `pricing-tier` (string), `checkout-config` (json).

| Kind | ts-server / ts-browser | go | java | dotnet |
| --- | --- | --- | --- | --- |
| boolean | `boolVariation` → `boolean` | `BoolVariation` → `bool` | `boolVariation` → `boolean` | `BoolVariation` → `bool` |
| string | `stringVariation` → `string` | `StringVariation` → `string` | `stringVariation` → `String` | `StringVariation` → `string` |
| number (double) | `numberVariation` → `number` | `Float64Variation` → `float64` | `doubleVariation` → `double` | `DoubleVariation` → `double` |
| number (int) | `numberVariation` → `number` | `IntVariation` → `int` | `intVariation` → `int` | `IntVariation` → `int` |
| json | `jsonVariation` → `unknown` | `JSONVariation` → `ldvalue.Value` | `jsonValueVariation` → `LDValue` | `JsonVariation` → `LdValue` |

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

`sdkMajors: [7]`. The `...Ctx` methods the wrapper calls arrived in v7.3.0,
so that is the oldest supported release; the compile fixture pins v7.19.0.
SDK facts are in [`docs/research/go-server-sdk-v7.md`](docs/research/go-server-sdk-v7.md).

**Config.** `out` is the path of the one generated `.go` file (for example
`internal/ldflags/flags_gen.go`); a value not ending in `.go` is exit 2.
`package` is required: a lowercase Go identifier that is not a keyword, else
exit 2 naming the key. There is no default from the directory name, since
directories like `ld-flags` aren't valid package names.

**Client.** `New` takes a generated `Client` interface listing the twenty
typed evaluation methods: four forms (`X`, `XDetail`, `XCtx`, `XDetailCtx`)
for each of bool, string, float64, int and JSON, always all five kinds in that
order, so adding a project's first flag of a kind never changes the interface
and breaks a hand-written fake. Signatures and parameter names are copied from
`*ld.LDClient`, which satisfies it; fakes can embed `Client` to stub only what
they use. No SDK interface has the `Ctx` methods, so neither
`interfaces.LDClientInterface` nor the value `WithEventsDisabled(true)`
returns can be passed to `New`. The file does not assert
`var _ Client = (*ld.LDClient)(nil)`: that would import the whole server SDK
into a package that otherwise needs only `go-sdk-common`. The compile fixture
asserts it instead.

**Methods.** Each flag gets four methods, with the SDK's suffix order. The
evaluation context parameter is named `context`, as in the SDK, so the stdlib
package is imported as `gocontext`, also as the SDK does. Results are passed
through unchanged, including the SDK's `error`.

**Doc comments.** The primary method's comment starts with the identifier,
then the description, the shared trailer (key in double quotes, since Go doc
has no code spans) and the UI link. The variants get one line each:
`XDetail is X with the evaluation reason.`, `XCtx is X with a Go context for
SDK hooks.`, `XDetailCtx is XDetail with a Go context for SDK hooks.` A
deprecated flag adds a `Deprecated:` paragraph to all four, and a
`// Deprecated:` comment on its constant inside the `const ( )` group. A
deprecation comment on the group itself would deprecate every constant in it.
The header is followed by a blank line and a `// Package <pkg> ...` comment;
without the blank line the header becomes the package doc and fails ST1000.

**Sanitizing doc text.** gofmt rewrites doc comments above top-level
declarations, so the emitter writes what gofmt would leave alone. The flag
name and description pass through these rules, fuzzed stable over 55k random
inputs on the prototype branch and re-fuzzed by the compile test:

- Drop control characters, NUL and BOM, turn tabs into spaces, and trim every
  line. No indented line survives, so nothing becomes a code block or list.
- Rewrite ` `` ` to “ and `''` to ”, as gofmt itself does.
- Collapse runs of blank lines. The flag name is put on one line.
- Join a description paragraph to the one before it when gofmt could
  reinterpret it: a lone heading-like line (gofmt's `isOldHeading`), a block
  made only of `[text]: ` link definitions, or a paragraph starting
  `Deprecated: `. Over-matching is harmless, since a joined paragraph is
  always stable. So a one-line description with no final period joins the
  summary paragraph.

**Constants.** `Key` + the flag's identifier, in one `const ( )` group sorted
by flag key. A `// Deprecated:` line ends gofmt's `=` alignment run, which the
emitter reproduces: alignment is per run of consecutive single-line specs,
padded by rune count.

**Toolchain.** The output passes `gofmt -l`, `go vet ./...` and
`staticcheck -checks all` (2025.1.1) on Go 1.25, the SDK's own floor: its
`go.mod` says `go 1.25.0` since v7.15.5. The compile fixture and CI pin those
versions, since staticcheck 2026.2.1 fails on go1.27.2. The working prototype
is on the
[`prototype/go-emitter`](https://github.com/tarqd/launchdarkly-codegen/tree/prototype/go-emitter/prototypes/go-emitter)
branch.

Complete output for the three example flags, with `checkout-config`
deprecated (`codegen.deprecated: Use checkout-layout instead.`):

```go
// Code generated by launchdarkly-codegen. DO NOT EDIT.
// project: my-project   generator: 0.3.0

// Package ldflags is a type-safe wrapper around the LaunchDarkly Go server SDK
// for the flags in project my-project.
package ldflags

import (
	gocontext "context"

	"github.com/launchdarkly/go-sdk-common/v3/ldcontext"
	"github.com/launchdarkly/go-sdk-common/v3/ldreason"
	"github.com/launchdarkly/go-sdk-common/v3/ldvalue"
)

// Client is the subset of the LaunchDarkly client that Flags calls: the typed
// evaluation methods for every flag kind. *ld.LDClient satisfies it.
type Client interface {
	BoolVariation(key string, context ldcontext.Context, defaultVal bool) (bool, error)
	BoolVariationDetail(key string, context ldcontext.Context, defaultVal bool) (bool, ldreason.EvaluationDetail, error)
	BoolVariationCtx(ctx gocontext.Context, key string, context ldcontext.Context, defaultVal bool) (bool, error)
	BoolVariationDetailCtx(ctx gocontext.Context, key string, context ldcontext.Context, defaultVal bool) (bool, ldreason.EvaluationDetail, error)
	StringVariation(key string, context ldcontext.Context, defaultVal string) (string, error)
	StringVariationDetail(key string, context ldcontext.Context, defaultVal string) (string, ldreason.EvaluationDetail, error)
	StringVariationCtx(ctx gocontext.Context, key string, context ldcontext.Context, defaultVal string) (string, error)
	StringVariationDetailCtx(ctx gocontext.Context, key string, context ldcontext.Context, defaultVal string) (string, ldreason.EvaluationDetail, error)
	Float64Variation(key string, context ldcontext.Context, defaultVal float64) (float64, error)
	Float64VariationDetail(key string, context ldcontext.Context, defaultVal float64) (float64, ldreason.EvaluationDetail, error)
	Float64VariationCtx(ctx gocontext.Context, key string, context ldcontext.Context, defaultVal float64) (float64, error)
	Float64VariationDetailCtx(ctx gocontext.Context, key string, context ldcontext.Context, defaultVal float64) (float64, ldreason.EvaluationDetail, error)
	IntVariation(key string, context ldcontext.Context, defaultVal int) (int, error)
	IntVariationDetail(key string, context ldcontext.Context, defaultVal int) (int, ldreason.EvaluationDetail, error)
	IntVariationCtx(ctx gocontext.Context, key string, context ldcontext.Context, defaultVal int) (int, error)
	IntVariationDetailCtx(ctx gocontext.Context, key string, context ldcontext.Context, defaultVal int) (int, ldreason.EvaluationDetail, error)
	JSONVariation(key string, context ldcontext.Context, defaultVal ldvalue.Value) (ldvalue.Value, error)
	JSONVariationDetail(key string, context ldcontext.Context, defaultVal ldvalue.Value) (ldvalue.Value, ldreason.EvaluationDetail, error)
	JSONVariationCtx(ctx gocontext.Context, key string, context ldcontext.Context, defaultVal ldvalue.Value) (ldvalue.Value, error)
	JSONVariationDetailCtx(ctx gocontext.Context, key string, context ldcontext.Context, defaultVal ldvalue.Value) (ldvalue.Value, ldreason.EvaluationDetail, error)
}

// Flags evaluates the flags of project my-project.
type Flags struct{ client Client }

// New returns a Flags that evaluates through client.
func New(client Client) *Flags { return &Flags{client: client} }

// CheckoutConfig evaluates the "Checkout config" flag.
//
// Layout and copy for the checkout page.
//
// key: "checkout-config" · tags: checkout · maintainer: team Payments
// https://app.launchdarkly.com/projects/my-project/flags/checkout-config
//
// Deprecated: Use checkout-layout instead.
func (f *Flags) CheckoutConfig(context ldcontext.Context, fallback ldvalue.Value) (ldvalue.Value, error) {
	return f.client.JSONVariation(KeyCheckoutConfig, context, fallback)
}

// CheckoutConfigDetail is CheckoutConfig with the evaluation reason.
//
// Deprecated: Use checkout-layout instead.
func (f *Flags) CheckoutConfigDetail(context ldcontext.Context, fallback ldvalue.Value) (ldvalue.Value, ldreason.EvaluationDetail, error) {
	return f.client.JSONVariationDetail(KeyCheckoutConfig, context, fallback)
}

// CheckoutConfigCtx is CheckoutConfig with a Go context for SDK hooks.
//
// Deprecated: Use checkout-layout instead.
func (f *Flags) CheckoutConfigCtx(ctx gocontext.Context, context ldcontext.Context, fallback ldvalue.Value) (ldvalue.Value, error) {
	return f.client.JSONVariationCtx(ctx, KeyCheckoutConfig, context, fallback)
}

// CheckoutConfigDetailCtx is CheckoutConfigDetail with a Go context for SDK hooks.
//
// Deprecated: Use checkout-layout instead.
func (f *Flags) CheckoutConfigDetailCtx(ctx gocontext.Context, context ldcontext.Context, fallback ldvalue.Value) (ldvalue.Value, ldreason.EvaluationDetail, error) {
	return f.client.JSONVariationDetailCtx(ctx, KeyCheckoutConfig, context, fallback)
}

// CheckoutV2 evaluates the "Checkout V2" flag.
//
// Routes eligible users to the rewritten checkout flow.
//
// key: "checkout-v2" · tags: checkout, q3 · maintainer: ada@example.com
// https://app.launchdarkly.com/projects/my-project/flags/checkout-v2
func (f *Flags) CheckoutV2(context ldcontext.Context, fallback bool) (bool, error) {
	return f.client.BoolVariation(KeyCheckoutV2, context, fallback)
}

// CheckoutV2Detail is CheckoutV2 with the evaluation reason.
func (f *Flags) CheckoutV2Detail(context ldcontext.Context, fallback bool) (bool, ldreason.EvaluationDetail, error) {
	return f.client.BoolVariationDetail(KeyCheckoutV2, context, fallback)
}

// CheckoutV2Ctx is CheckoutV2 with a Go context for SDK hooks.
func (f *Flags) CheckoutV2Ctx(ctx gocontext.Context, context ldcontext.Context, fallback bool) (bool, error) {
	return f.client.BoolVariationCtx(ctx, KeyCheckoutV2, context, fallback)
}

// CheckoutV2DetailCtx is CheckoutV2Detail with a Go context for SDK hooks.
func (f *Flags) CheckoutV2DetailCtx(ctx gocontext.Context, context ldcontext.Context, fallback bool) (bool, ldreason.EvaluationDetail, error) {
	return f.client.BoolVariationDetailCtx(ctx, KeyCheckoutV2, context, fallback)
}

// PricingTier evaluates the "Pricing tier" flag.
//
// Which pricing tier a customer sees.
//
// key: "pricing-tier" · tags: billing
// https://app.launchdarkly.com/projects/my-project/flags/pricing-tier
func (f *Flags) PricingTier(context ldcontext.Context, fallback string) (string, error) {
	return f.client.StringVariation(KeyPricingTier, context, fallback)
}

// PricingTierDetail is PricingTier with the evaluation reason.
func (f *Flags) PricingTierDetail(context ldcontext.Context, fallback string) (string, ldreason.EvaluationDetail, error) {
	return f.client.StringVariationDetail(KeyPricingTier, context, fallback)
}

// PricingTierCtx is PricingTier with a Go context for SDK hooks.
func (f *Flags) PricingTierCtx(ctx gocontext.Context, context ldcontext.Context, fallback string) (string, error) {
	return f.client.StringVariationCtx(ctx, KeyPricingTier, context, fallback)
}

// PricingTierDetailCtx is PricingTierDetail with a Go context for SDK hooks.
func (f *Flags) PricingTierDetailCtx(ctx gocontext.Context, context ldcontext.Context, fallback string) (string, ldreason.EvaluationDetail, error) {
	return f.client.StringVariationDetailCtx(ctx, KeyPricingTier, context, fallback)
}

// Flag keys, for code that needs the raw key.
const (
	// Deprecated: Use checkout-layout instead.
	KeyCheckoutConfig = "checkout-config"
	KeyCheckoutV2     = "checkout-v2"
	KeyPricingTier    = "pricing-tier"
)
```

### java (`com.launchdarkly:launchdarkly-java-server-sdk` 7.x)

`sdkMajors: [7]`. The generated class accepts
`com.launchdarkly.sdk.server.interfaces.LDClientInterface`, which `LDClient`
implements. The SDK has no narrower evaluation-only interface. The Java SDK has
no context-propagation methods, so each flag gets two methods: `x` and
`xDetail`. Number flags call `doubleVariation`, or `intVariation` with
`codegen.number: int` (ADR 0001). The SDK bundles its common types
(`LDContext`, `LDValue`, `EvaluationDetail`), so the import list never needs a
second artifact. 6.x has the same ten methods and the output compiles against
6.3.0 too, but 6 isn't supported until someone asks; adding it is one list
entry and one fixture run. Facts and sources:
[`docs/research/java-server-sdk.md`](docs/research/java-server-sdk.md).

**Config.** `out` is a directory, and the emitter writes `<out>/Flags.java`
holding `public final class Flags`, the only class name Java allows in that
file. `package` is required: dot-separated identifiers, each matching
`[A-Za-z_$][A-Za-z0-9_$]*` and not a reserved word; anything else is exit 2
naming the key. The generator doesn't check `package` against `out`, because
javac reports the mismatch.

**Shape.**

- The class Javadoc names the project, and the private `client` field and the
  constructor both carry their own comment (doclint checks private members and
  wants a main description, not only `@param`).
- Each flag's `x` and `xDetail` carry the same doc comment (see Doc
  comments) except for `@return`. The name is the first line. Each
  blank-line-separated paragraph of the description becomes a `<p>`
  paragraph, and single newlines inside one join with a space. The trailer is
  `<p>key: {@code k} · tags: … · maintainer: …<br>` followed by the plain UI
  URL. `@param context`, `@param fallback`, `@return` and, when deprecated,
  `@deprecated` follow.
- Nested `public static final class Keys` holds one documented
  `public static final String` per flag, named in CONSTANT_CASE from the method
  name (alias included), plus a commented `private Keys() {}`. The methods
  read their key from `Keys`, so an alias renames both together.
- The imports are exactly those used, in ASCII order: `EvaluationDetail` and
  `LDContext` only when a flag exists, `LDValue` only for a json flag.
  google-java-format deletes unused imports.

**Canonical form is google-java-format 1.37.0**
([ADR 0004](docs/adr/0004-java-output-is-google-java-format-canonical.md)).
The emitter does the formatter's layout itself; no formatter runs. These are
all the rules the emitted shapes need:

- Widths are counted in UTF-16 code units (JavaScript's `length`), with a
  limit of 100 columns, and indentation is two spaces.
- Javadoc text is greedily filled: words separated by single spaces, with a
  line break wherever the next word would pass column 100 counting the indent
  and ` * `. A word longer than the room sits alone on a line and overflows
  (a long URL). `<br>` ends the line. Each `<p>` paragraph and the block tags
  are preceded by a bare ` *`. A block tag's continuation lines are indented 4
  more spaces. `{@code k}` is two words and may be split after `{@code`.
- A comment that fits on one line is written `/** text */`.
- A signature or `return client.xVariation(…);` that passes 100 breaks after
  `(`, with the arguments on one line 4 deeper; if that line passes 100 too,
  one argument per line. A constant that passes 100 breaks after `=`, the
  literal 4 deeper.
- Every member is preceded by a blank line, the first one in a class body
  excepted.
- An annotation on a method goes on its own line; `@Deprecated` on a constant
  stays on the same line.

The complete sample: the prototype from add-emitter step 2, on
[`prototype/java-emitter`](https://github.com/tarqd/launchdarkly-codegen/tree/prototype/java-emitter/prototypes/java-emitter).
The first flag's description shows the escaping.

```java
// Code generated by launchdarkly-codegen. DO NOT EDIT.
// project: storefront   generator: 0.1.0
package com.example.flags;

import com.launchdarkly.sdk.EvaluationDetail;
import com.launchdarkly.sdk.LDContext;
import com.launchdarkly.sdk.LDValue;
import com.launchdarkly.sdk.server.interfaces.LDClientInterface;

/** Typed accessors for the flags in LaunchDarkly project {@code storefront}. */
public final class Flags {
  /** The wrapped SDK client. */
  private final LDClientInterface client;

  /**
   * Wraps an SDK client.
   *
   * @param client the LaunchDarkly client to evaluate flags with
   */
  public Flags(LDClientInterface client) {
    this.client = client;
  }

  /**
   * Checkout V2
   *
   * <p>Routes eligible users to the rewritten checkout flow.
   *
   * <p>Matches paths like /cart/**&#47;*.json *&#47; when a &lt; b &amp;&amp; c &gt; d. &#64;since
   * is not a tag here, nor is {&#64;code x}.
   *
   * <p>key: {@code checkout-v2} · tags: checkout, q3 · maintainer: team Payments<br>
   * https://app.eu.launchdarkly.com/projects/storefront/flags/checkout-v2
   *
   * @param context the context to evaluate the flag for
   * @param fallback the value to return if the flag can't be evaluated
   * @return the flag's value for {@code context}
   */
  public boolean checkoutV2(LDContext context, boolean fallback) {
    return client.boolVariation(Keys.CHECKOUT_V2, context, fallback);
  }

  /**
   * Checkout V2
   *
   * <p>Routes eligible users to the rewritten checkout flow.
   *
   * <p>Matches paths like /cart/**&#47;*.json *&#47; when a &lt; b &amp;&amp; c &gt; d. &#64;since
   * is not a tag here, nor is {&#64;code x}.
   *
   * <p>key: {@code checkout-v2} · tags: checkout, q3 · maintainer: team Payments<br>
   * https://app.eu.launchdarkly.com/projects/storefront/flags/checkout-v2
   *
   * @param context the context to evaluate the flag for
   * @param fallback the value to return if the flag can't be evaluated
   * @return the flag's value for {@code context}, with the reason it was chosen
   */
  public EvaluationDetail<Boolean> checkoutV2Detail(LDContext context, boolean fallback) {
    return client.boolVariationDetail(Keys.CHECKOUT_V2, context, fallback);
  }

  /**
   * Pricing tier
   *
   * <p>key: {@code pricing-tier} · maintainer: ada@example.com<br>
   * https://app.eu.launchdarkly.com/projects/storefront/flags/pricing-tier
   *
   * @param context the context to evaluate the flag for
   * @param fallback the value to return if the flag can't be evaluated
   * @return the flag's value for {@code context}
   */
  public String pricingTier(LDContext context, String fallback) {
    return client.stringVariation(Keys.PRICING_TIER, context, fallback);
  }

  /**
   * Pricing tier
   *
   * <p>key: {@code pricing-tier} · maintainer: ada@example.com<br>
   * https://app.eu.launchdarkly.com/projects/storefront/flags/pricing-tier
   *
   * @param context the context to evaluate the flag for
   * @param fallback the value to return if the flag can't be evaluated
   * @return the flag's value for {@code context}, with the reason it was chosen
   */
  public EvaluationDetail<String> pricingTierDetail(LDContext context, String fallback) {
    return client.stringVariationDetail(Keys.PRICING_TIER, context, fallback);
  }

  /**
   * Discount rate
   *
   * <p>key: {@code discount-rate}<br>
   * https://app.eu.launchdarkly.com/projects/storefront/flags/discount-rate
   *
   * @param context the context to evaluate the flag for
   * @param fallback the value to return if the flag can't be evaluated
   * @return the flag's value for {@code context}
   */
  public double discountRate(LDContext context, double fallback) {
    return client.doubleVariation(Keys.DISCOUNT_RATE, context, fallback);
  }

  /**
   * Discount rate
   *
   * <p>key: {@code discount-rate}<br>
   * https://app.eu.launchdarkly.com/projects/storefront/flags/discount-rate
   *
   * @param context the context to evaluate the flag for
   * @param fallback the value to return if the flag can't be evaluated
   * @return the flag's value for {@code context}, with the reason it was chosen
   */
  public EvaluationDetail<Double> discountRateDetail(LDContext context, double fallback) {
    return client.doubleVariationDetail(Keys.DISCOUNT_RATE, context, fallback);
  }

  /**
   * Max items
   *
   * <p>key: {@code max-items}<br>
   * https://app.eu.launchdarkly.com/projects/storefront/flags/max-items
   *
   * @param context the context to evaluate the flag for
   * @param fallback the value to return if the flag can't be evaluated
   * @return the flag's value for {@code context}
   */
  public int maxItems(LDContext context, int fallback) {
    return client.intVariation(Keys.MAX_ITEMS, context, fallback);
  }

  /**
   * Max items
   *
   * <p>key: {@code max-items}<br>
   * https://app.eu.launchdarkly.com/projects/storefront/flags/max-items
   *
   * @param context the context to evaluate the flag for
   * @param fallback the value to return if the flag can't be evaluated
   * @return the flag's value for {@code context}, with the reason it was chosen
   */
  public EvaluationDetail<Integer> maxItemsDetail(LDContext context, int fallback) {
    return client.intVariationDetail(Keys.MAX_ITEMS, context, fallback);
  }

  /**
   * Checkout config
   *
   * <p>key: {@code checkout-config}<br>
   * https://app.eu.launchdarkly.com/projects/storefront/flags/checkout-config
   *
   * @param context the context to evaluate the flag for
   * @param fallback the value to return if the flag can't be evaluated
   * @return the flag's value for {@code context}
   */
  public LDValue checkoutConfig(LDContext context, LDValue fallback) {
    return client.jsonValueVariation(Keys.CHECKOUT_CONFIG, context, fallback);
  }

  /**
   * Checkout config
   *
   * <p>key: {@code checkout-config}<br>
   * https://app.eu.launchdarkly.com/projects/storefront/flags/checkout-config
   *
   * @param context the context to evaluate the flag for
   * @param fallback the value to return if the flag can't be evaluated
   * @return the flag's value for {@code context}, with the reason it was chosen
   */
  public EvaluationDetail<LDValue> checkoutConfigDetail(LDContext context, LDValue fallback) {
    return client.jsonValueVariationDetail(Keys.CHECKOUT_CONFIG, context, fallback);
  }

  /**
   * Legacy cart
   *
   * <p>The pre-2024 cart.
   *
   * <p>key: {@code legacy-cart} · tags: checkout<br>
   * https://app.eu.launchdarkly.com/projects/storefront/flags/legacy-cart
   *
   * @param context the context to evaluate the flag for
   * @param fallback the value to return if the flag can't be evaluated
   * @return the flag's value for {@code context}
   * @deprecated Use search-v2. Removal planned for Q4 *&#47; 2026 &amp; later.
   */
  @Deprecated
  public boolean legacyCart(LDContext context, boolean fallback) {
    return client.boolVariation(Keys.LEGACY_CART, context, fallback);
  }

  /**
   * Legacy cart
   *
   * <p>The pre-2024 cart.
   *
   * <p>key: {@code legacy-cart} · tags: checkout<br>
   * https://app.eu.launchdarkly.com/projects/storefront/flags/legacy-cart
   *
   * @param context the context to evaluate the flag for
   * @param fallback the value to return if the flag can't be evaluated
   * @return the flag's value for {@code context}, with the reason it was chosen
   * @deprecated Use search-v2. Removal planned for Q4 *&#47; 2026 &amp; later.
   */
  @Deprecated
  public EvaluationDetail<Boolean> legacyCartDetail(LDContext context, boolean fallback) {
    return client.boolVariationDetail(Keys.LEGACY_CART, context, fallback);
  }

  /** The raw key of every flag, for code that needs the key itself. */
  public static final class Keys {
    /** Not instantiable. */
    private Keys() {}

    /** {@code checkout-v2} */
    public static final String CHECKOUT_V2 = "checkout-v2";

    /** {@code pricing-tier} */
    public static final String PRICING_TIER = "pricing-tier";

    /** {@code discount-rate} */
    public static final String DISCOUNT_RATE = "discount-rate";

    /** {@code max-items} */
    public static final String MAX_ITEMS = "max-items";

    /** {@code checkout-config} */
    public static final String CHECKOUT_CONFIG = "checkout-config";

    /**
     * {@code legacy-cart}
     *
     * @deprecated Use search-v2. Removal planned for Q4 *&#47; 2026 &amp; later.
     */
    @Deprecated public static final String LEGACY_CART = "legacy-cart";
  }
}
```

**Compile fixture.** `fixtures/compile/java/` is a Maven project (one
`pom.xml`, no `package.json`) pinning `launchdarkly-java-server-sdk` 7.17.2.
The compile test copies the golden file into it and runs three checks,
all of which must pass with no output:

- `mvn compile` with `--release 8 -Xlint:all,-options -Xdoclint:all -Werror`.
  Java 8 is the SDK's floor (class-file major 52); `-options` only silences
  JDK 21's notice that release 8 is obsolete.
- `javadoc -Xdoclint:all -Werror`. javac's doclint does not report unknown
  tags such as a stray `@foo`, and the `javadoc` tool does.
- `java -jar google-java-format-1.37.0-all-deps.jar --dry-run
  --set-exit-if-changed`, which needs JDK 21 to run.

CI uses `actions/setup-java` with JDK 21, whose runners ship `mvn`. The fixture
also needs a consumer class calling every generated method, which passing the
compile proves type-correct.

### dotnet (`LaunchDarkly.ServerSdk` 8.x)

`sdkMajors: [8]`. 7.x reached end of life on 2024-10-16. The wrapper takes
`ILdClient` (namespace `LaunchDarkly.Sdk.Server.Interfaces`), which the
sealed `LdClient` implements, so callers pass the real client and tests can
pass a fake. The SDK has no async, `CancellationToken` or `Ctx` evaluation
methods, so each flag gets two methods, `X` and `XDetail` (returning
`EvaluationDetail<T>`), and the fallback is always required. Research:
[`docs/research/dotnet-server-sdk.md`](docs/research/dotnet-server-sdk.md).

The SDK targets `netstandard2.0`, `net462` and `net8.0`, and the first two
default to C# 7.3. The output is C# 7.3, so one file compiles everywhere the
SDK does: a block-scoped namespace, an ordinary constructor, and no
`#nullable` or `?` annotations. The SDK isn't nullable-annotated either, so
the API is nullability-oblivious to consumers.

The header's third line, `// <auto-generated/>`, marks the file as generated
(as does the `.g.cs` name). Analyzers, IDE style rules and `dotnet format`
then skip it, so a consumer's `.editorconfig` never disagrees with what
`check` compares. Compiler warnings still apply, which is why every public
member has a doc comment and deprecation reaches consumers.

Deprecation is a compile error for consumers who build with
`TreatWarningsAsErrors`: on .NET 5+ it is `LDFLAG001` with a link to the
flag, which `<NoWarn>LDFLAG001</NoWarn>` or `#pragma warning disable
LDFLAG001` silences on its own; on older frameworks it is CS0618 (ADR 0003).
The deprecated members of the same file can reference each other without a
warning.

Target options:

- `namespace` (required): dotted C# identifiers, none of them a keyword. A
  last segment of `Flags` or `FlagKeys` is rejected (exit 2), because code in
  the parent namespace would then resolve `Flags` to the namespace (CS0118).
- `out` is the path of the one generated `.cs` file (for example
  `src/Billing/FeatureFlags/Flags.g.cs`); a value not ending in `.cs` is exit 2.
  The `.g.cs` suffix is recommended, not required, since the
  `// <auto-generated/>` line already marks the file as generated.

The prototype in [`prototypes/dotnet`](prototypes/dotnet) is the sample
output for four flags (the shared three plus a deprecated number flag,
`max-cart-items`):

```csharp
// Code generated by launchdarkly-codegen. DO NOT EDIT.
// project: my-project   generator: 0.3.0
// <auto-generated/>

using LaunchDarkly.Sdk;
using LaunchDarkly.Sdk.Server.Interfaces;

namespace MyApp.FeatureFlags
{
    /// <summary>
    /// Typed accessors for the flags in LaunchDarkly project <c>my-project</c>.
    /// </summary>
    public sealed class Flags
    {
        private readonly ILdClient _client;

        /// <summary>
        /// Creates a wrapper that evaluates flags through <paramref name="client"/>.
        /// </summary>
        /// <param name="client">The LaunchDarkly client, usually an <c>LdClient</c>.</param>
        public Flags(ILdClient client)
        {
            _client = client;
        }

        /// <summary>
        /// Checkout V2
        /// <para>Routes eligible users to the rewritten checkout flow.</para>
        /// <para>key: <c>checkout-v2</c> · tags: checkout, q3 · maintainer: ada@example.com</para>
        /// <para><see href="https://app.launchdarkly.com/projects/my-project/flags/checkout-v2"/></para>
        /// </summary>
        /// <param name="context">The context to evaluate the flag for.</param>
        /// <param name="fallback">The value to use if the flag can't be evaluated.</param>
        /// <returns>The flag's value for <paramref name="context"/>.</returns>
        public bool CheckoutV2(Context context, bool fallback)
        {
            return _client.BoolVariation(FlagKeys.CheckoutV2, context, fallback);
        }

        /// <summary>Checkout V2, with the reason for the value. See <see cref="CheckoutV2"/>.</summary>
        /// <param name="context">The context to evaluate the flag for.</param>
        /// <param name="fallback">The value to use if the flag can't be evaluated.</param>
        /// <returns>The flag's value and the reason it was chosen.</returns>
        public EvaluationDetail<bool> CheckoutV2Detail(Context context, bool fallback)
        {
            return _client.BoolVariationDetail(FlagKeys.CheckoutV2, context, fallback);
        }

        /// <summary>
        /// Pricing Tier
        /// <para>key: <c>pricing-tier</c> · maintainer: team Payments</para>
        /// <para><see href="https://app.launchdarkly.com/projects/my-project/flags/pricing-tier"/></para>
        /// </summary>
        /// <param name="context">The context to evaluate the flag for.</param>
        /// <param name="fallback">The value to use if the flag can't be evaluated.</param>
        /// <returns>The flag's value for <paramref name="context"/>.</returns>
        public string PricingTier(Context context, string fallback)
        {
            return _client.StringVariation(FlagKeys.PricingTier, context, fallback);
        }

        /// <summary>Pricing Tier, with the reason for the value. See <see cref="PricingTier"/>.</summary>
        /// <param name="context">The context to evaluate the flag for.</param>
        /// <param name="fallback">The value to use if the flag can't be evaluated.</param>
        /// <returns>The flag's value and the reason it was chosen.</returns>
        public EvaluationDetail<string> PricingTierDetail(Context context, string fallback)
        {
            return _client.StringVariationDetail(FlagKeys.PricingTier, context, fallback);
        }

        /// <summary>
        /// Max Cart Items
        /// <para>Caps the number of items in a cart &amp; at checkout.</para>
        /// <para>key: <c>max-cart-items</c></para>
        /// <para><see href="https://app.launchdarkly.com/projects/my-project/flags/max-cart-items"/></para>
        /// </summary>
        /// <remarks>Deprecated: Use cart-limits instead.</remarks>
        /// <param name="context">The context to evaluate the flag for.</param>
        /// <param name="fallback">The value to use if the flag can't be evaluated.</param>
        /// <returns>The flag's value for <paramref name="context"/>.</returns>
#if NET5_0_OR_GREATER
        [System.Obsolete("Use cart-limits instead.", DiagnosticId = "LDFLAG001", UrlFormat = "https://app.launchdarkly.com/projects/my-project/flags/max-cart-items")]
#else
        [System.Obsolete("Use cart-limits instead.")]
#endif
        public double MaxCartItems(Context context, double fallback)
        {
            return _client.DoubleVariation(FlagKeys.MaxCartItems, context, fallback);
        }

        /// <summary>Max Cart Items, with the reason for the value. See <see cref="MaxCartItems"/>.</summary>
        /// <param name="context">The context to evaluate the flag for.</param>
        /// <param name="fallback">The value to use if the flag can't be evaluated.</param>
        /// <returns>The flag's value and the reason it was chosen.</returns>
#if NET5_0_OR_GREATER
        [System.Obsolete("Use cart-limits instead.", DiagnosticId = "LDFLAG001", UrlFormat = "https://app.launchdarkly.com/projects/my-project/flags/max-cart-items")]
#else
        [System.Obsolete("Use cart-limits instead.")]
#endif
        public EvaluationDetail<double> MaxCartItemsDetail(Context context, double fallback)
        {
            return _client.DoubleVariationDetail(FlagKeys.MaxCartItems, context, fallback);
        }

        /// <summary>
        /// Checkout Config
        /// <para>key: <c>checkout-config</c></para>
        /// <para><see href="https://app.launchdarkly.com/projects/my-project/flags/checkout-config"/></para>
        /// </summary>
        /// <param name="context">The context to evaluate the flag for.</param>
        /// <param name="fallback">The value to use if the flag can't be evaluated.</param>
        /// <returns>The flag's value for <paramref name="context"/>.</returns>
        public LdValue CheckoutConfig(Context context, LdValue fallback)
        {
            return _client.JsonVariation(FlagKeys.CheckoutConfig, context, fallback);
        }

        /// <summary>Checkout Config, with the reason for the value. See <see cref="CheckoutConfig"/>.</summary>
        /// <param name="context">The context to evaluate the flag for.</param>
        /// <param name="fallback">The value to use if the flag can't be evaluated.</param>
        /// <returns>The flag's value and the reason it was chosen.</returns>
        public EvaluationDetail<LdValue> CheckoutConfigDetail(Context context, LdValue fallback)
        {
            return _client.JsonVariationDetail(FlagKeys.CheckoutConfig, context, fallback);
        }
    }

    /// <summary>
    /// The raw key of every flag in <see cref="Flags"/>.
    /// </summary>
    public static class FlagKeys
    {
        /// <summary>Key of the flag behind <see cref="Flags.CheckoutV2"/>.</summary>
        public const string CheckoutV2 = "checkout-v2";

        /// <summary>Key of the flag behind <see cref="Flags.PricingTier"/>.</summary>
        public const string PricingTier = "pricing-tier";

        /// <summary>Key of the flag behind <see cref="Flags.MaxCartItems"/>.</summary>
#if NET5_0_OR_GREATER
        [System.Obsolete("Use cart-limits instead.", DiagnosticId = "LDFLAG001", UrlFormat = "https://app.launchdarkly.com/projects/my-project/flags/max-cart-items")]
#else
        [System.Obsolete("Use cart-limits instead.")]
#endif
        public const string MaxCartItems = "max-cart-items";

        /// <summary>Key of the flag behind <see cref="Flags.CheckoutConfig"/>.</summary>
        public const string CheckoutConfig = "checkout-config";
    }
}
```

The full doc comment (name, description, trailer, link) sits on the main
method, and a deprecated flag's adds a `<remarks>Deprecated: ...</remarks>`.
The `Detail` method and the key constant get a one-line summary with a
`<see cref>` to the main method, plus the same `[Obsolete]`.

The compile fixture `fixtures/compile/dotnet/` builds every golden file with
`TreatWarningsAsErrors`, `AnalysisLevel=latest-all`, `AnalysisMode=All`,
`EnforceCodeStyleInBuild`, `GenerateDocumentationFile` and
`WarningLevel=9999`, in two projects: `modern` (net8.0, latest C#,
`Nullable=enable`) and `legacy` (netstandard2.0, C# 7.3, which covers the
pre-.NET 5 deprecation branch). `modern` also builds a copy with the
`<auto-generated/>` line removed, so every analyzer still runs on the output,
and the test asserts `dotnet format --verify-no-changes --include-generated`
changes nothing. CI installs .NET 8 with `actions/setup-dotnet`.

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
    out: internal/ldflags/flags_gen.go
    package: ldflags
    sdkMajor: 7
  - id: java
    out: services/billing/src/main/java/com/example/flags/
    package: com.example.flags
    sdkMajor: 7
  - id: dotnet
    out: src/Billing/FeatureFlags/Flags.g.cs
    namespace: Billing.FeatureFlags
    sdkMajor: 8

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
  -Xdoclint:all -Werror` via Maven, plus `javadoc -Xdoclint:all` and
  google-java-format; see java). These run on the CI matrix only, not on
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
3. `emit-go`, `emit-java`, `emit-dotnet`.
4. `emit-ts-browser`, including legacy client SDK support via `sdkMajor`.
5. React target.
6. JSON schema typing if there is demand.
