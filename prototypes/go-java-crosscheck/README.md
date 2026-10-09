# PROTOTYPE: Go and Java cross-check

Throwaway. Answers "Go and Java cross-check of the flag model, naming and emitter interface"
(tarqd/launchdarkly-codegen#10). Hand-written Go and Java output for `fixture.json`, compiled
against the real SDKs. The verdicts live on the issue; this branch is the primary source.

## Run

```sh
cd go   && go vet ./... && go run .                    # go-server-sdk v7.19.0
GOTOOLCHAIN=go1.25.1 go run honnef.co/go/tools/cmd/staticcheck@2025.1.1 -checks all,-ST1000 ./...
cd java && mvn -q compile                              # java-server-sdk 7.17.2, -Xlint:all -Xdoclint:all -Werror
```

Results: Go passes `gofmt -l`, `go vet` and staticcheck (`-checks all`). Its only finding
is the intended SA1019 on `deprecated_use.go`. Java compiles warning-free under
`-Xlint:all -Xdoclint:all -Werror`, and a call to `oldBanner` raises the deprecation warning.

## Findings

1. **Numbers.** Go needs `IntVariation` or `Float64Variation`; Java needs `intVariation` or
   `doubleVariation`. `big-quota` (5000000000) fits Go's 64-bit `int` but not Java's 32-bit
   `int`, so a per-target choice would diverge.
2. **Go client.** A small generated `Client` interface is satisfied by both `*ld.LDClient` and
   `interfaces.LDClientEvaluations`. Neither SDK interface has the `...Ctx` methods.
3. **Collisions with derived names.** `checkout` + `checkout-detail` both want
   `CheckoutDetail`. Go fails to compile. Java silently overloads when the parameter types
   differ (and fails only when they match). Constants (`KeyX`, `X_CONST`) can collide the same way.
4. **Java overloads of `Object` methods.** `wait(LDContext, boolean)` compiles but overloads
   the final `Object.wait`. So do `equals`, `hashCode`, `toString`, `getClass`, `notify`,
   `notifyAll`, `clone` and `finalize`.
5. **Go reserved words never bite.** Go keywords are lowercase and methods are UpperCamel.
   Only generated names (`New`, `Client`, `Flags`, `Key*`) matter, and those fall under finding 3.
6. **Doc comments.** Go comments must start with the identifier (`// Checkout evaluates the
   "Checkout" flag.`), not the flag name. Javadoc is HTML: escape `&`, `<`, `>` and `*/`
   (as `*&#47;`). `-Xdoclint:all` also wants `@param`/`@return` and comments on private
   members. Deprecation has to propagate to `...Detail` and to the key constant.
7. **`splitBy: tag`.** In Go it only splits files: one `Flags` type, methods spread across
   `flags_<tag>.go`. In Java it's one class per tag. Multi-tag flags go to their first tag
   (tags sorted), and untagged flags go to `UntaggedFlags` / `flags_untagged.go`. Naming must
   also turn **tags** into identifiers and catch tag collisions.
8. **Emitter interface holds.** `emit(model, cfg): GeneratedFile[]` covered multi-file output
   for both targets with nothing beyond the Flag model. Naming needs a constant-case form
   (`API_URL_ID`) as well as method casing.
9. **Go version.** `go mod tidy` with go-server-sdk v7.19.0 raises the module's `go`
   directive to 1.25.0, so the compile fixture needs Go ≥ 1.25.
