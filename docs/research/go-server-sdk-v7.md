# Go target: go-server-sdk v7, doc comments, gofmt, staticcheck

Research for the `go` target, checked against primary sources on 2026-10-10.
It covers the sketch in DESIGN.md, "Generated code by target" > "go".

SDK source: `github.com/launchdarkly/go-server-sdk/v7@v7.19.0`, downloaded
from the module proxy (https://proxy.golang.org/github.com/launchdarkly/go-server-sdk/v7/@v/v7.19.0.zip,
commit `e77ca8c2`). Unless a section says otherwise, file paths are relative
to that module root. Toolchains used for the experiments: go1.24.7 (local),
go1.26.9, go1.27.0 and go1.27.2 (fetched with `GOTOOLCHAIN`), and staticcheck
2026.2.1 (v0.8.1).

## Verdicts on the DESIGN sketch

| DESIGN claim | Verdict |
| --- | --- |
| `interfaces.LDClientEvaluations` lacks the `Ctx` methods, so a generated `Client` interface is needed | **Correct.** No interface in `interfaces/` has a `Ctx` method (§2). |
| `*ld.LDClient` satisfies the generated `Client` | **Correct.** All 20 typed signatures, compile-checked (§3). |
| Suffix order `BoolVariationDetailCtx` | **Correct** (§3). |
| `gocontext "context"` alias | **Correct.** It matches the SDK's own `ldclient.go` (§4). |
| "v7.19.0 raises the `go` directive to 1.25.0 under `go mod tidy`" | **Right effect, wrong cause and date.** The SDK's own `go.mod` has declared `go 1.25.0` since **v7.15.5** (2026-07-28). The bump came with `golang.org/x/crypto v0.52.0` and `golang.org/x/sys v0.45.0`, both of which declare `go 1.25.0` (§1). |
| Header line directly followed by `package ldflags` | **Wrong.** With no blank line, the header becomes the package doc comment. `staticcheck -checks all` then reports ST1000. The fix is a blank line plus a `// Package ldflags ...` comment, which the prototype branch already has (§7). |
| "Go: nothing to escape" in doc comments | **Wrong.** `*/` is harmless, but gofmt rewrites many shapes of arbitrary text, so the output would not be gofmt-stable. The most likely trigger is a one-line description with no final punctuation, which gofmt turns into a `# ` heading (§5). |
| "Go uses that exact first line so `go vet` ... recognize it as generated" | **Mostly wrong for vet.** Only vet's `stdversion` analyzer looks at the marker. staticcheck, `go/ast.IsGenerated` and gopls are the tools that use it (§7). |
| Go keywords can't collide with UpperCamel names | **Correct.** All 25 keywords and all predeclared identifiers are lower-case. Gap: a name is exported only if its first rune is Unicode **Lu**, so an alias starting with a Lo letter (such as CJK) gives an unexported name (§6). |
| Initialisms `Id`/`Url`/`Api` | **Incomplete.** staticcheck's default list has 42 entries (§6). ST1003 is skipped for generated files anyway, so the list is a style choice and nothing enforces it. |
| Sketch indents with 4 spaces | **Fine in the doc, wrong as output.** gofmt indents with tabs. |
| Deprecation on the key constant | **Needs a placement rule.** Put `Deprecated:` on the individual spec inside `const ( )`, never on the group's doc comment. staticcheck applies a group doc's deprecation to every name in the group (§5). A comment line inside the block also breaks gofmt alignment (§7). |

New findings that DESIGN does not mention:

- **`WithEventsDisabled(true)` can't be passed to `New`.** On an events-enabled
  client it returns a `*clientEventsDisabledDecorator`. That type has the
  Bool, Int, Float64 and String `Ctx` methods but **not** `JSONVariationCtx`
  or `JSONVariationDetailCtx`. If the generated `Client` lists the JSON `Ctx`
  methods, the decorator doesn't satisfy it (checked at runtime; see
  `ldclient_events.go:284-315`).
- **The generated package doesn't import the SDK module.** It needs only
  `go-sdk-common/v3`, whose `go.mod` declares `go 1.24`. The 1.25.0 floor
  comes from the consumer's dependency on `go-server-sdk/v7`, and from the
  fixture's `var _ ldflags.Client = (*ld.LDClient)(nil)` assertion.
- **staticcheck 2026.2.1 breaks on go1.27.2.** Built and run with go1.27.2,
  it fails with `export data version 5 is greater than maximum supported
  version 4`. It works with go1.27.0 and go1.26.9. The release notes do claim
  Go 1.27 support (https://staticcheck.dev/changes/2026.2/), so pin the
  fixture's toolchain.

## 1. Module coordinates and versions

- **Module path:** `github.com/launchdarkly/go-server-sdk/v7`. The package
  name is `ldclient` and the SDK's own tests import it as `ld`
  (`package_info.go`; `proxytest/ldclient_proxy_test.go:17`).
  https://pkg.go.dev/github.com/launchdarkly/go-server-sdk/v7
- **Current major is v7.** `/v8` has no versions:
  https://proxy.golang.org/github.com/launchdarkly/go-server-sdk/v8/@latest
  returns "no matching versions".
- **Latest release:** v7.19.0, tag `refs/tags/v7.19.0`, proxy time
  2026-10-07T18:07:56Z
  (https://proxy.golang.org/github.com/launchdarkly/go-server-sdk/v7/@latest).
  CHANGELOG.md dates it 2026-10-07. `internal/version.go:4` has
  `SDKVersion = "7.19.0"`.
- **go-sdk-common:** v7.19.0 requires `github.com/launchdarkly/go-sdk-common/v3 v3.6.0`
  (https://proxy.golang.org/github.com/launchdarkly/go-server-sdk/v7/@v/v7.19.0.mod).
  v3.6.0 is also the latest v3 (2026-09-24), and its `go.mod` declares `go 1.24`
  (https://proxy.golang.org/github.com/launchdarkly/go-sdk-common/v3/@v/v3.6.0.mod).
  `ldcontext`, `ldreason` and `ldvalue` live in that module. Note: v7.15.1
  and v7.15.2 briefly required `go-sdk-common/v4` and are retracted
  (`retract [v7.15.1, v7.15.2]` in go.mod).
- **`go` directive:** v7.19.0's own go.mod says `go 1.25.0`. History of the
  directive, read from each version's `.mod` on the proxy:
  - 1.18 for v7.0–7.1
  - 1.21 for v7.2–7.6.0
  - 1.18 again for v7.6.1–7.8
  - 1.20 for v7.9
  - 1.23.0 for v7.10–7.14.0
  - 1.24.0 for v7.14.1–7.15.4
  - **1.25.0 from v7.15.5** (2026-07-28)

  The jump to 1.25.0 comes with the bump to `golang.org/x/crypto v0.52.0`
  and `golang.org/x/sys v0.45.0`, both of which declare `go 1.25.0`
  (https://proxy.golang.org/golang.org/x/crypto/@v/v0.52.0.mod,
  https://proxy.golang.org/golang.org/x/sys/@v/v0.45.0.mod).

  The SDK's stated policy disagrees with its go.mod:
  `.github/variables/go-versions.env` says `latest=1.27`, `penultimate=1.26`,
  `min=1.24`, and README.md says the minimum is whatever go.mod has.
- **What we saw:**
  - With go1.24.7 and `GOTOOLCHAIN=local`, `go mod download` refuses the
    module: "requires go >= 1.25.0 (running go 1.24.7)".
  - A consumer module at `go 1.24` that imports the SDK is rewritten to
    `go 1.25.0` by `go mod tidy`.
- **First `...Ctx` methods: v7.3.0** (2024-04-03), the release that added
  hooks. CHANGELOG.md says: "This release introduces a Hooks API". v7.2.0's
  `ldclient.go` has no `VariationCtx`. v7.3.0 has all ten typed `Ctx`
  methods plus `MigrationVariationCtx`.

## 2. Client type and SDK interfaces

- The concrete type is `*ldclient.LDClient` (`ldclient.go`). Constructors
  are `MakeClient` and `MakeCustomClient`.
- `interfaces/client_interface.go` (v7.19.0) declares these interfaces:
  - `LDClientEvaluations`: Bool, Int, Float64, String and JSON `Variation`
    and `VariationDetail`, plus `MigrationVariation` and `AllFlagsState`.
  - `LDClientEvents`: Identify and the Track methods.
  - `LDClientInterface`: embeds both, plus `WithEventsDisabled`.
  - `LDMigrationOpTracker` and `LDLoggers`.

  **None of them declares a `Ctx` method** (grep for `Ctx(` in
  `interfaces/*.go` finds nothing). DESIGN is right.
  https://pkg.go.dev/github.com/launchdarkly/go-server-sdk/v7/interfaces#LDClientEvaluations
- Two other client-shaped types:
  - `LDScopedClient` (`ldclient_scoped.go`) is marked beta. Its methods drop
    the `context` parameter (`BoolVariation(key string, defaultVal bool)`),
    so it can't satisfy the generated `Client`.
  - `clientEventsDisabledDecorator` (`ldclient_events.go`) lacks the JSON
    `Ctx` methods; see the verdicts above.

## 3. Exact signatures (`ldclient.go`, v7.19.0)

Parameter names are identical across all twenty methods: `ctx`, `key`,
`context`, `defaultVal`. In the source the `Detail` and `Ctx` forms are
wrapped one parameter per line. They are written on one line here, and the
whole set was compile-checked as a generated interface that `*ld.LDClient`
satisfies (go1.27.2, `go vet` clean).

```go
BoolVariation(key string, context ldcontext.Context, defaultVal bool) (bool, error)                                      // :902
BoolVariationDetail(key string, context ldcontext.Context, defaultVal bool) (bool, ldreason.EvaluationDetail, error)     // :912
BoolVariationCtx(ctx gocontext.Context, key string, context ldcontext.Context, defaultVal bool) (bool, error)             // :931
BoolVariationDetailCtx(ctx gocontext.Context, key string, context ldcontext.Context, defaultVal bool) (bool, ldreason.EvaluationDetail, error) // :949

IntVariation(key string, context ldcontext.Context, defaultVal int) (int, error)                                         // :969
IntVariationDetail(key string, context ldcontext.Context, defaultVal int) (int, ldreason.EvaluationDetail, error)        // :979
IntVariationCtx(ctx gocontext.Context, key string, context ldcontext.Context, defaultVal int) (int, error)                // :1000
IntVariationDetailCtx(ctx gocontext.Context, key string, context ldcontext.Context, defaultVal int) (int, ldreason.EvaluationDetail, error) // :1018

Float64Variation(key string, context ldcontext.Context, defaultVal float64) (float64, error)                             // :1036
Float64VariationDetail(key string, context ldcontext.Context, defaultVal float64) (float64, ldreason.EvaluationDetail, error) // :1046
Float64VariationCtx(ctx gocontext.Context, key string, context ldcontext.Context, defaultVal float64) (float64, error)    // :1065
Float64VariationDetailCtx(ctx gocontext.Context, key string, context ldcontext.Context, defaultVal float64) (float64, ldreason.EvaluationDetail, error) // :1083

StringVariation(key string, context ldcontext.Context, defaultVal string) (string, error)                                // :1101
StringVariationDetail(key string, context ldcontext.Context, defaultVal string) (string, ldreason.EvaluationDetail, error) // :1111
StringVariationCtx(ctx gocontext.Context, key string, context ldcontext.Context, defaultVal string) (string, error)       // :1130
StringVariationDetailCtx(ctx gocontext.Context, key string, context ldcontext.Context, defaultVal string) (string, ldreason.EvaluationDetail, error) // :1148

JSONVariation(key string, context ldcontext.Context, defaultVal ldvalue.Value) (ldvalue.Value, error)                    // :1182
JSONVariationDetail(key string, context ldcontext.Context, defaultVal ldvalue.Value) (ldvalue.Value, ldreason.EvaluationDetail, error) // :1196
JSONVariationCtx(ctx gocontext.Context, key string, context ldcontext.Context, defaultVal ldvalue.Value) (ldvalue.Value, error) // :1238
JSONVariationDetailCtx(ctx gocontext.Context, key string, context ldcontext.Context, defaultVal ldvalue.Value) (ldvalue.Value, ldreason.EvaluationDetail, error) // :1256
```

- **`Int` means Go `int`.** `IntVariation`'s doc says a non-integer numeric
  value "is rounded toward zero (truncated)" (`ldclient.go:960-967`). This
  matters for ADR 0001 (number flags default to double, so they map to
  `Float64Variation`).
- **JSON uses `ldvalue.Value`** for both the default and the result. The SDK
  has no other JSON or "object" variant.
- **Other evaluation methods:**
  - `MigrationVariation(key string, context ldcontext.Context, defaultStage ldmigration.Stage) (ldmigration.Stage, interfaces.LDMigrationOpTracker, error)`
    (`:415`), plus a `Ctx` form (`:428`).
  - `AllFlagsState(context ldcontext.Context, options ...flagstate.Option) flagstate.AllFlags`
    (`:802`).
- **The method name reported to hooks** is `"LDClient.BoolVariation"` for
  the plain and Detail forms and `"LDClient.BoolVariationCtx"` for the `Ctx`
  forms (`ldclient.go:43-53`). Hooks can see which form the wrapper called.

## 4. Context propagation

- **`ctx` is the stdlib `context.Context`.** The SDK imports it as
  `gocontext "context"` in `ldclient.go:4`, `ldclient_scoped.go` and
  `internal/hooks/*.go`. It needs the alias because the evaluation-context
  parameter is named `context`, which would shadow the package.
  `ldclient_gocontext.go` imports plain `"context"` because no parameter
  there is named `context`.
- **The SDK uses `ctx` only to pass to hooks.** Doc text on every `Ctx`
  method: "Cancelling the context.Context will not cause the evaluation to be
  cancelled. The context.Context is used by hook implementations refer to
  [ldhooks.Hook]" (`ldclient.go:925-927`).
  - The plain methods pass `gocontext.TODO()` (`:903`).
  - `variationWithHooks` passes `ctx` to `hookRunner.RunEvaluation`
    (`:1331-1351`). If there are no hooks, that returns `fn()` directly
    (`internal/hooks/runner.go:36-50`).
  - `ldhooks.EvaluationSeries.BeforeEvaluation` and `AfterEvaluation` take
    `ctx context.Context` (`ldhooks/hooks.go:28-52`). That is how tracing
    (the separate `github.com/launchdarkly/go-server-sdk/ldotel` module,
    latest v1.3.5) gets spans.
- **`ldcontext.Context` is a struct, passed by value**
  (`go-sdk-common/v3@v3.6.0/ldcontext/context.go:26`).
  - `ldreason.EvaluationDetail` is a struct (`ldreason/detail.go:10`).
  - `ldvalue.Value` is a struct (`ldvalue/value_base.go:52`).
- **The name clash** only matters inside a function that has a `context`
  parameter. The generated file must import stdlib context under an alias,
  as the sketch does with `gocontext`. Or it could name the parameter
  something else; parameter names in an interface don't affect satisfaction.

## 5. Go doc comments and what gofmt rewrites

Source: https://go.dev/doc/comment, and the implementation in
`$GOROOT/src/go/printer/comment.go` and `go/doc/comment/parse.go`. The
behavior is identical in go1.24.7 and go1.27.2: the same test file gives the
same `gofmt -d` output under both.

### Conventions

- **Doc comments sit directly above a top-level declaration** with no blank
  line in between. "Every exported (capitalized) name should have a doc
  comment."
- **They start with the declared name.** Doc comments for types and funcs
  "start with complete sentences naming the declared symbol" (sections
  "Types" and "Funcs"). staticcheck enforces this as ST1020, ST1021 and
  ST1022, but those checks are not on by default and are skipped in
  generated files (§7).
- **`Deprecated:`** "Paragraphs starting with `Deprecated: ` are treated as
  deprecation notices ... The paragraph does not have to be the last
  paragraph." It must be its own paragraph, with a blank `//` line before
  it.
  - staticcheck splits `doc.Text()` on `"\n\n"` and requires the prefix
    `"Deprecated: "`, with the space
    (`honnef.co/go/tools@v0.8.1/analysis/facts/deprecated/deprecated.go:34-49`).
    So `Deprecated:` on a line straight after other text, or with an empty
    message, is not recognized. We checked: gofmt leaves the unseparated form
    alone, so nothing would warn you.
- **Grouped consts:** one doc comment can introduce the group, and
  individual specs get end-of-line comments or their own doc comments
  ("Consts" section). staticcheck applies a `Deprecated:` in the
  **GenDecl** doc to every name in the group, and per-spec docs to that
  spec only (`deprecated.go`, `case *ast.GenDecl`). So deprecate on the
  spec.
  - The same file shows that a package may use its own deprecated objects
    without SA1019 (`sa1019.go`: "A package is allowed to use its own
    deprecated objects"). The generated deprecated method can use the
    deprecated `Key...` constant.

### Which comments gofmt rewrites

gofmt reformats a comment only when it starts at **column 1** and ends on the
line directly above the next token (`go/printer/printer.go:740-747`,
"Unindented comment abutting next token position: a top-level doc comment").
So:

- **Rewritten:** doc comments on top-level `func`, `type`, `const`, `var`
  and `package`.
- **Not rewritten:** comments on specs inside `const ( )`, on interface
  methods, and on struct fields, because they are indented. Tested:
  ` ``q`` ` inside a const block was left alone. `go doc` still renders them
  with the same syntax.
- **Applied to every comment:** gofmt removes trailing whitespace and `\r`.
  The scanner strips CR from comment text.

Rewrites seen with `gofmt -d` on arbitrary paragraph text, after `// `:

| Input line(s) after `// ` | gofmt output |
| --- | --- |
| Line starting with space(s) or tab (`  foo`) | It becomes a **code block**: `//\tfoo`, the common indent replaced by one tab, and a blank `//` added before and after. Two spaces after `//` (`//  x`) count as indented. |
| One-line paragraph between blank lines that starts upper-case, ends in a letter or digit, has none of `;:!?+*/=[]{}_^°&§~%#@<">\`, uses `'` only as `'s` and `.` only before a non-space, and is followed by another unindented paragraph | It gets a `# ` prefix, turning it into a **heading** (`isOldHeading`, parse.go:568). A realistic case: description `Routes eligible users to the rewritten checkout flow` with no period, between the summary line and the `key:` trailer, became `# Routes ...`. |
| ` `` ` or `''` anywhere, flag name included | Replaced by `“` and `”`. Single backticks are left alone. |
| Two or more blank `//` lines in a row | Collapsed to one. |
| Leading or trailing blank `//` lines | Removed. A comment made only of blank lines is removed entirely. |
| Whitespace-only line (`//    `) | Becomes `//`, a paragraph break. |
| Paragraph whose every line is `[Text]: URL` | It's a link definition and is moved to the end of the comment, in two blocks: used targets, then unused. |
| Indented `*`, `+` or `-` list item, or `1)` | Normalized to `  - item` or ` 1. item`, with 4-space continuation lines and a blank line after the list. |
| Unindented `1. x` followed by an indented line | Heuristically merged into a list (` 1. x` / `    cont`). |
| Unindented line ending in `{` or `\` followed by an indented line | Pulled into a code block. An unindented `}` line straight after indented lines is pulled in too. |
| A line like `//go:generate`, `//line `, `//extern `, `//export `, or `//[a-z0-9]+:[a-z0-9]` with **no space** after `//` | It's a directive and is moved to the end, after a blank `//`. An emitter that always writes `// ` (with the space) can't produce one. |

Left alone (already canonical), all tested:

- `*/` and `/*` in `//` text
- an unindented `- item`, `• item` or `1. item` that is not followed by an
  indented line
- `#hashtag`, `# x` in the middle of a paragraph, and `# Heading` set off by
  blank lines (this one renders as a heading)
- `[Name]` and `[pkg.Name]` doc links
- bare URLs, which are auto-linked when rendered
- `TODO(x):` notes
- repeated inner spaces and tabs
- `Deprecated:` without a blank line before it, which is left alone and not
  recognized

Can't be emitted at all: NUL ("illegal character NUL"), a BOM anywhere but
the file start ("illegal byte order mark") and invalid UTF-8 are all compile
errors (spec, "Source code representation"; tested with gofmt).

What this means for us: "nothing to escape" is wrong. Byte-stable output
needs one of two approaches:

- normalize descriptions (drop leading indentation, trailing whitespace, CR
  and extra blank lines; neutralize ` `` ` and `''`; avoid isolated one-line
  heading-shaped paragraphs), or
- port the `go/doc/comment` parse and print rules and emit their canonical
  form, testing idempotence against real `gofmt` on fuzzed descriptions.

## 6. Identifiers, keywords, exported names, initialisms

Spec: https://go.dev/ref/spec (Language version go1.27).

- `identifier = letter { letter | unicode_digit }`
  - `letter = unicode_letter | "_"`, where letters are categories Lu, Ll,
    Lt, Lm and Lo.
  - `unicode_digit` is category Nd.
  - "The underscore character _ (U+005F) is considered a lowercase letter."
- **The 25 keywords:** `break case chan const continue default defer else
  fallthrough for func go goto if import interface map package range return
  select struct switch type var`.
- **Predeclared identifiers**, all lower-case:
  - types: `any bool byte comparable complex64 complex128 error float32
    float64 int int8 int16 int32 int64 rune string uint uint8 uint16 uint32
    uint64 uintptr`
  - constants: `true false iota`
  - zero value: `nil`
  - functions: `append cap clear close complex copy delete imag len make max
    min new panic print println real recover`
- **Exported:** "the first character of the identifier's name is a Unicode
  uppercase letter (Unicode character category Lu)". Title-case (Lt) and
  caseless letters (Lo, such as `日`) are **not** exported. So an
  UpperCamel conversion of an alias that starts with a Lo letter gives an
  unexported method. `Key`-prefixed constants are always exported.
- **staticcheck ST1003 default initialisms**
  (`honnef.co/go/tools@v0.8.1/config/config.go`, `DefaultConfig`): ACL,
  API, ASCII, CPU, CSS, DNS, EOF, GUID, HTML, HTTP, HTTPS, ID, IP, JSON,
  QPS, RAM, RPC, SLA, SMTP, SQL, SSH, TCP, TLS, TTL, UDP, UI, GID, UID,
  UUID, URI, URL, UTF8, VM, XML, XMPP, XSRF, XSS, SIP, RTP, AMQP, DB, TS.
  These can be extended with `initialisms` in `staticcheck.conf`.
  - ST1003 is `NonDefault` and is skipped in generated files.
  - Tested: without the header, `GetApiUrl` gives "should be GetAPIURL"
    and `KeyApiId` gives "should be KeyAPIID". With the header, no
    diagnostics.

## 7. Formatter, vet, staticcheck, generated marker

- **gofmt alignment in const blocks:** go/printer aligns with
  `text/tabwriter` (`go/printer/printer.go:1390-1396`). Tested:
  - A run of consecutive one-line specs aligns `=` in one column.
  - **A comment line between specs ends the run.** `KeyA = "a"`, then
    `// doc`, then `KeyLonger = "b"`: these are not aligned with each other.
  - A blank line ends the run, and so does a multi-line value.
  - Very long names do **not** break the run; everything is padded to the
    longest name.
  - Width is counted in **runes**, not display cells: `KeyÄÖÜ` gets 2
    spaces of padding and `Key日本` gets 3 to line up with `KeyABCD`.
  - End-of-line comments get their own aligned column.
- **`go vet`** runs all registered analyzers by default ("By default all
  analyzers are run", `go tool vet help`). In go1.27.2 those are: appends
  asmdecl assign atomic bools buildtag cgocall composites copylocks defers
  directive errorsas framepointer hostport httpresponse ifaceassert
  loopclosure lostcancel nilfunc printf shift sigchanyzer slog stdmethods
  stdversion stringintconv structtag testinggoroutine tests timeformat
  unmarshal unreachable unsafeptr unusedresult waitgroup.
  - `go test` runs only atomic, bools, buildtag, directive, errorsas,
    ifaceassert, nilfunc, printf, stdversion, stringintconv and tests
    (`go help test`).
  - Of vet's analyzers, only `stdversion` checks `ast.IsGenerated`.
  - The sketch shape is vet-clean.
- **staticcheck:** latest is **2026.2.1 (v0.8.1)**, 2026-08-21
  (https://proxy.golang.org/honnef.co/go/tools/@latest).
  - The default set is `all` minus the `NonDefault` checks: ST1000, ST1003,
    ST1016, ST1020, ST1021, ST1022, ST1023 and SA9003 (grep `NonDefault: true`).
  - The sketch is clean under the defaults. Under `-checks all` its only
    finding is **ST1000** at 1:1, because the header is the package comment:
    "package comment should be of the form "Package ldflags..."".
  - With a blank line after the header and no package comment, ST1000
    reports "at least one file in a package should have a package comment".
    With `// Package ldflags ...` directly above `package`, the result is
    clean, and so are gofmt and vet.
- **Checks skipped in generated files** are the ones calling
  `report.FilterGenerated()`:
  - S1000–S1012, S1016–S1021, S1023–S1025, S1028, S1030–S1035, S1037–S1040
  - SA4003, SA4018, SA4019, SA4021, SA9003
  - ST1001, ST1003, ST1006, ST1013, ST1015, ST1017, ST1019, ST1020,
    ST1021, ST1022

  U1000 (unused) treats everything in a generated file as used
  (`unused/unused.go`, `GeneratedIsUsed: true`).

  **ST1000 and SA1019 are not filtered.**
- **staticcheck's generated-file test** (`analysis/facts/generated/generated.go`):
  any line, anywhere in the file, that starts with `// Code generated ` and
  ends with ` DO NOT EDIT.`. Our header matches.
- **The official marker** (https://go.dev/s/generatedcode redirects to
  https://go.dev/cmd/go/#hdr-Generate_Go_files_by_processing_source):
  the file must have a line matching `^// Code generated .* DO NOT EDIT\.$`,
  and "This line must appear before the first non-comment, non-blank text
  in the file."
  - `go/ast.IsGenerated` (`go/ast/ast.go:1113`) only looks at comments
    before the `package` keyword.

## 8. Other corrections for the DESIGN Go sketch

1. Add a blank line after the two header lines, then
   `// Package ldflags ...` directly above `package ldflags`.
2. Correct the toolchain note: v7.15.5 or later (not 7.19.0) declares
   `go 1.25.0` in its own go.mod, inherited from x/crypto v0.52.0 and x/sys
   v0.45.0. Pin a toolchain that the pinned staticcheck can load (not
   go1.27.2 with 2026.2.1).
3. Replace "Go: nothing to escape" with the gofmt rules in §5.
4. Put `Deprecated:` on each `Key...` spec inside the const block, never on
   the group doc. The emitter's const-block alignment must restart after
   every comment line.
5. Reject converted names whose first rune is not Lu, or prefix them.
6. Decide what to do about the JSON `Ctx` gap in `WithEventsDisabled`.
   Options: document it, or leave the JSON `Ctx` methods out of `Client`
   when the project has no JSON flags (they're already per-kind).
