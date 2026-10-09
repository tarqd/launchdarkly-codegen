# SDK packages, current majors and typed variation APIs

Research for issue #9. The question: are the SDK packages, majors and method
signatures in `DESIGN.md` ("Generated code by target") correct today?

Checked 2026-10-09. Sources: package registries (npm, proxy.golang.org, Maven
Central) and the published type definitions or sources of the release each
one lists as current. Signatures below come from the shipped `.d.ts` files,
the Go module zip and the Java `-sources.jar`, not from blog posts or READMEs.

## Summary

| Target | Package | Current major (latest) | Typed variation methods | Detail return type | JSON value type |
| --- | --- | --- | --- | --- | --- |
| ts-server | `@launchdarkly/node-server-sdk` | **9** (9.14.4) | `bool/number/string/jsonVariation(key, context, defaultValue): Promise<T>` | `Promise<LDEvaluationDetailTyped<T>>` | `unknown` |
| ts-browser (current) | `@launchdarkly/js-client-sdk` | **4** (4.11.2). There was never a 3.x; it went 0.13.x to 4.0.0 | `bool/number/string/jsonVariation(key, defaultValue): T` (synchronous) | `LDEvaluationDetailTyped<T>` | `unknown` |
| ts-browser (legacy) | `launchdarkly-js-client-sdk` | **3** (3.9.6), still published, not deprecated | none. Only `variation(key, defaultValue?): LDFlagValue` (`any`) | `variationDetail(...)`: `LDEvaluationDetail` (`value: any`) | `any` |
| go | `github.com/launchdarkly/go-server-sdk/v7` | **7** (v7.19.0); no `/v8` module | `BoolVariation`, `IntVariation`, `Float64Variation`, `StringVariation`, `JSONVariation` `(key string, context ldcontext.Context, defaultVal T) (T, error)` | `(T, ldreason.EvaluationDetail, error)` | `ldvalue.Value` |
| java | `com.launchdarkly:launchdarkly-java-server-sdk` | **7** (7.17.2) | `boolVariation`, `intVariation`, `doubleVariation`, `stringVariation`, `jsonValueVariation` `(String key, LDContext context, T defaultValue)` | `EvaluationDetail<Boolean/Integer/Double/String/LDValue>` | `LDValue` |
| react (later) | `@launchdarkly/react-sdk` (on js-client-sdk 4) or legacy `launchdarkly-react-client-sdk` (on legacy 3.x) | 4 (4.1.26) / 3 (3.9.4) | n/a | n/a | n/a |

## Node server SDK

Registry: `npm view @launchdarkly/node-server-sdk` returns `latest` 9.14.4
(9.0.0 shipped 2023-10-16; `maintenance` tag 8.2.6). It depends on
`@launchdarkly/js-server-sdk-common` 2.24.1 and re-exports it through
`export * from '@launchdarkly/js-server-sdk-common'`, and that package in turn
re-exports all of `@launchdarkly/js-sdk-common`. So `LDClient`, `LDContext`,
`LDEvaluationDetail`, `LDEvaluationDetailTyped` and `LDFlagValue` can all be
imported from `@launchdarkly/node-server-sdk`.

`LDClient` comes from `js-server-sdk-common` 2.24.1 (`dist/index.d.ts`). The
Node `LDClient` extends it and adds `EventEmitter`:

```ts
variation(key: string, context: LDContext, defaultValue: LDFlagValue, callback?): Promise<LDFlagValue>;
variationDetail(key: string, context: LDContext, defaultValue: LDFlagValue, callback?): Promise<LDEvaluationDetail>;
boolVariation(key: string, context: LDContext, defaultValue: boolean): Promise<boolean>;
numberVariation(key: string, context: LDContext, defaultValue: number): Promise<number>;
stringVariation(key: string, context: LDContext, defaultValue: string): Promise<string>;
jsonVariation(key: string, context: LDContext, defaultValue: unknown): Promise<unknown>;
boolVariationDetail(key: string, context: LDContext, defaultValue: boolean): Promise<LDEvaluationDetailTyped<boolean>>;
numberVariationDetail(key: string, context: LDContext, defaultValue: number): Promise<LDEvaluationDetailTyped<number>>;
stringVariationDetail(key: string, context: LDContext, defaultValue: string): Promise<LDEvaluationDetailTyped<string>>;
jsonVariationDetail(key: string, context: LDContext, defaultValue: unknown): Promise<LDEvaluationDetailTyped<unknown>>;
```

Detail types (`@launchdarkly/js-sdk-common` 2.29.0,
`dist/esm/api/data/LDEvaluationDetail.d.ts` and `LDFlagValue.d.ts`):

```ts
export type LDFlagValue = any;
export interface LDEvaluationDetail { value: LDFlagValue; variationIndex?: number | null; reason: LDEvaluationReason; }
export interface LDEvaluationDetailTyped<TFlag> { value: TFlag; variationIndex?: number | null; reason: LDEvaluationReason; }
```

What this means for us:
- `LDEvaluationDetail.value` is `any`. The typed `*VariationDetail` methods
  do **not** return it, though. They return `LDEvaluationDetailTyped<T>`, so
  `value` is already `boolean`/`number`/`string`/`unknown`. Generated code
  needs no `TypedDetail<T>` or `detail()` narrowing helper.
- `jsonVariation` takes and returns `unknown`, not `LDFlagValue`.

## Browser client SDK

Registry:
- `@launchdarkly/js-client-sdk`: `latest` 4.11.2. The version list goes
  `0.13.1` to `4.0.0` (published 2026-02-04). **3.x was never published for
  this package.**
- `launchdarkly-js-client-sdk` (legacy): `latest` 3.9.6 (3.0.0 shipped
  2022-12-07; last publish 2026-10-02). Not marked deprecated on npm.
- The LaunchDarkly JavaScript SDK reference
  (https://launchdarkly.com/docs/sdk/client-side/javascript) says: "In the
  JavaScript SDK v4.x, the package name is `@launchdarkly/js-client-sdk`" and
  "In earlier versions of the SDK, the package was named `ldclient-js` or
  `launchdarkly-js-client-sdk`." Its install examples are labelled "JavaScript
  SDK v4.x" and "JS SDK v3.7+".

So the two packages have **separate majors**: 3 means the legacy package and
4 means the scoped one. `sdkMajor` therefore picks the package without any
ambiguity.

`@launchdarkly/js-client-sdk` 4.11.2 exports `type LDClient` (an `Omit<...>`
of the common client plus browser additions), `createClient(clientSideId,
pristineContext, options?)`, `LDEvaluationDetailTyped` and `LDFlagValue`. The
variation methods come from `@launchdarkly/js-client-sdk-common` 1.32.5
(`dist/esm/api/LDClient.d.ts`):

```ts
boolVariation(key: string, defaultValue: boolean): boolean;
boolVariationDetail(key: string, defaultValue: boolean): LDEvaluationDetailTyped<boolean>;
jsonVariation(key: string, defaultValue: unknown): unknown;
jsonVariationDetail(key: string, defaultValue: unknown): LDEvaluationDetailTyped<unknown>;
numberVariation(key: string, defaultValue: number): number;
numberVariationDetail(key: string, defaultValue: number): LDEvaluationDetailTyped<number>;
stringVariation(key: string, defaultValue: string): string;
stringVariationDetail(key: string, defaultValue: string): LDEvaluationDetailTyped<string>;
variation(key: string, defaultValue?: LDFlagValue): LDFlagValue;
variationDetail(key: string, defaultValue?: LDFlagValue): LDEvaluationDetail;
```

These are synchronous and take no context, as DESIGN.md says. The context is
passed to `createClient` (v4 also needs `start()`) or to `identify`.

Legacy `launchdarkly-js-client-sdk` 3.9.6 gets its types from
`launchdarkly-js-sdk-common` 5.8.3 (`typings.d.ts`). The client has only
`variation(key, defaultValue?): LDFlagValue` and
`variationDetail(key, defaultValue?): LDEvaluationDetail`, with
`LDFlagValue = any`. It has no typed methods, which matches what DESIGN.md
says. Any type check for this package would have to live in generated code.

## Go server SDK

Registry (proxy.golang.org):
- `github.com/launchdarkly/go-server-sdk/v7` `@latest` = v7.19.0
  (2026-10-07). `/v8` returns "no matching versions".
- The v7.19.0 `go.mod` requires `github.com/launchdarkly/go-sdk-common/v3
  v3.6.0`. Note that a `go-sdk-common/v4` (v4.0.1) module now exists, but
  server SDK v7 does not use it. Generated Go code must import `/v3` to match
  the SDK's types.

`ldclient.go` (v7.19.0):

```go
func (client *LDClient) BoolVariation(key string, context ldcontext.Context, defaultVal bool) (bool, error)
func (client *LDClient) BoolVariationDetail(key string, context ldcontext.Context, defaultVal bool) (bool, ldreason.EvaluationDetail, error)
func (client *LDClient) IntVariation(key string, context ldcontext.Context, defaultVal int) (int, error)
func (client *LDClient) Float64Variation(key string, context ldcontext.Context, defaultVal float64) (float64, error)
func (client *LDClient) StringVariation(key string, context ldcontext.Context, defaultVal string) (string, error)
func (client *LDClient) JSONVariation(key string, context ldcontext.Context, defaultVal ldvalue.Value) (ldvalue.Value, error)
// each has a ...Detail form returning (T, ldreason.EvaluationDetail, error)
// and ...Ctx / ...DetailCtx forms taking a leading gocontext.Context
```

`ldreason.EvaluationDetail` (go-sdk-common v3.6.0, `ldreason/detail.go`) is a
struct `{ Value ldvalue.Value; VariationIndex ldvalue.OptionalInt; Reason
EvaluationReason }`. It is untyped, but the typed value is returned alongside
it.

Exported interfaces, in package
`github.com/launchdarkly/go-server-sdk/v7/interfaces`
(`interfaces/client_interface.go`):
- `LDClientEvaluations`: every `*Variation`/`*VariationDetail` method above
  plus `MigrationVariation` and `AllFlagsState`.
- `LDClientEvents`: track and identify methods.
- `LDClientInterface`: embeds both plus `WithEventsDisabled(bool)
  LDClientInterface`. Its doc comment reads "defines the basic SDK client
  operations implemented by LDClient".
- **The `...Ctx` variants are not part of any of these interfaces.**

So `clientInterface: true` can use `interfaces.LDClientEvaluations`, which is
the narrowest exported fit, or `interfaces.LDClientInterface`. Another
option, and the more common one in Go, is for the generator to emit its own
small interface with only the methods the generated file calls. That also
works if we later want the `...Ctx` variants, which the SDK interfaces leave
out.

Go has no single "number" type. Number flags map to `IntVariation` or
`Float64Variation`, and the generator has to choose between them.

## Java server SDK

Registry: Maven Central `com.launchdarkly:launchdarkly-java-server-sdk`
`maven-metadata.xml` has `<release>7.17.2</release>`. The majors listed are
5.0.0, 6.0.0 and 7.0.0. The published POM has no declared dependencies,
because common types are bundled into the artifact.

`com/launchdarkly/sdk/server/interfaces/LDClientInterface.java` (7.17.2
sources jar). `public interface LDClientInterface extends Closeable`, and
`public final class LDClient implements LDClientInterface`:

```java
boolean boolVariation(String key, LDContext context, boolean defaultValue);
int intVariation(String key, LDContext context, int defaultValue);
double doubleVariation(String key, LDContext context, double defaultValue);
String stringVariation(String key, LDContext context, String defaultValue);
LDValue jsonValueVariation(String key, LDContext context, LDValue defaultValue);
EvaluationDetail<Boolean> boolVariationDetail(String key, LDContext context, boolean defaultValue);
EvaluationDetail<Integer> intVariationDetail(String key, LDContext context, int defaultValue);
EvaluationDetail<Double> doubleVariationDetail(String key, LDContext context, double defaultValue);
EvaluationDetail<String> stringVariationDetail(String key, LDContext context, String defaultValue);
EvaluationDetail<LDValue> jsonValueVariationDetail(String key, LDContext context, LDValue defaultValue);
```

The imports are `com.launchdarkly.sdk.EvaluationDetail`,
`com.launchdarkly.sdk.LDContext` and `com.launchdarkly.sdk.LDValue`, the same
ones DESIGN.md uses. `jsonValueVariation` is the correct name.

As in Go, number flags must map to `int` or `double`.

## React (later target)

`@launchdarkly/react-client-sdk`, the name DESIGN.md uses, **does not exist
on npm** (404). The real packages are:
- `@launchdarkly/react-sdk` 4.1.26 ("LaunchDarkly SDK for React frameworks").
  It depends on `@launchdarkly/js-client-sdk ^4.11.2`.
- `launchdarkly-react-client-sdk` 3.9.4 (legacy). It depends on
  `launchdarkly-js-client-sdk ^3.9.5`.

## Corrections to DESIGN.md

1. **ts-server example: `jsonVariation` type.** `jsonVariation` takes and
   returns `unknown`, not `LDFlagValue` (which is `any`). The JSON accessor
   should be `checkoutConfig(context, fallback: unknown): Promise<unknown>`.
   Emitting `LDFlagValue` would widen the SDK's own type.
2. **ts-server and ts-browser: the detail helper is unnecessary.**
   `*VariationDetail` already returns `LDEvaluationDetailTyped<T>` in both
   current TS SDKs. `TypedDetail<T>` and `detail()` should become
   `LDEvaluationDetailTyped<T>` imported from the SDK, with a direct
   `return this.client.boolVariationDetail(...)`. The "Runtime helper
   packages" rationale ("TypeScript's SDK detail types are untyped on
   `value`") is only true of the untyped `variationDetail`/`LDEvaluationDetail`.
   It is not true of the typed methods we call. The
   `@launchdarkly/codegen-runtime-node` import is also obsolete, since no
   runtime packages are published.
3. **ts-browser major.** The current `@launchdarkly/js-client-sdk` is **v4**,
   not v3. That package never had a 3.x. The heading should read
   `@launchdarkly/js-client-sdk` v4, and the example config `sdkMajor: 3`
   under ts-browser actually means the legacy `launchdarkly-js-client-sdk`.
   For the current SDK it should be `sdkMajor: 4`.
4. **ts-browser legacy note.** This one is accurate: the legacy 3.x package
   has only an untyped `variation()`. Because the majors don't overlap (3 is
   legacy, 4 is scoped), `sdkMajor` alone picks the package. Under the
   no-runtime-package decision, the legacy type check has to be emitted as
   generated code, not supplied by "the runtime helper"
   (`@launchdarkly/codegen-runtime-browser`).
5. **React package name.** `@launchdarkly/react-client-sdk` does not exist.
   Use `@launchdarkly/react-sdk` (v4, on js-client-sdk 4) or
   `launchdarkly-react-client-sdk` (legacy v3).
6. **Go `clientInterface: true`.** The design should name the interface. The
   SDK exports `interfaces.LDClientEvaluations` and
   `interfaces.LDClientInterface` from
   `github.com/launchdarkly/go-server-sdk/v7/interfaces`. Neither includes the
   `...Ctx` variants, so emitting a minimal local interface may be the better
   default.
7. **Number kinds in Go and Java.** DESIGN.md says "flag kinds map to SDK
   methods", but Go (`IntVariation`/`Float64Variation`) and Java
   (`intVariation`/`doubleVariation`) have no single number method. The
   design needs a rule for choosing between them, for example int only when
   every variation is an integer.

Confirmed correct as written: Node server SDK v9 and its `bool/string/
numberVariation` signatures; Go `/v7` with `go-sdk-common/v3` imports and its
`BoolVariation`/`BoolVariationDetail`/`JSONVariation` signatures; Java 7.x,
`LDClientInterface`, `EvaluationDetail<Boolean>` and `jsonValueVariation`.

## Not confirmed from a primary source

- I could not list the Java binary jar to confirm that `com.launchdarkly.sdk.*`
  classes are bundled, because Maven Central rate-limited the download (429).
  This is inferred from the POM declaring no dependencies and from the
  sources jar importing `com.launchdarkly.sdk.EvaluationDetail` and the
  others.
- The GitHub SDK repositories were not reachable from this session. All
  signatures were read from the published registry artifacts (npm tarballs,
  Go module zip, Maven sources jar). Those are the shipped code, so this
  doesn't weaken the findings.
