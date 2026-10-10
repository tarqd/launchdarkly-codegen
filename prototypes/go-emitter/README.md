# PROTOTYPE: Go emitter output

Throwaway. Answers step 2 of `add-emitter go`: does hand-written output for
three flags (`checkout-v2` boolean, `pricing-tier` string, `checkout-config`
JSON, deprecated) compile cleanly against go-server-sdk v7.19.0, and can flag
names and descriptions be made gofmt-stable without running gofmt?

## Run

```sh
export GOTOOLCHAIN=go1.25.1
gofmt -l . && go vet ./... && go run .
go run honnef.co/go/tools/cmd/staticcheck@2025.1.1 -checks all ./...
node docfuzz/fuzz.mjs line 5000 1     # trailer style: line | list
```

## Results

- `gofmt -l` prints nothing, `go vet` is clean, and `*ld.LDClient` satisfies the
  generated `Client` (all four forms per kind, `gocontext` alias as the SDK uses).
- staticcheck `-checks all` reports nothing in `ldflags`. The only findings are the
  five intended SA1019 hits in `main.go`: deprecation reaches the method, its
  `Detail`, `Ctx` and `DetailCtx` variants, and the key constant (a per-constant
  comment inside the `const ( )` group).
- A comment line inside the const group ends gofmt's `=` alignment run; the
  sample shows the canonical result.
- Doc text: DESIGN.md's "Go: nothing to escape" is wrong. The fuzzed sanitizer
  (in `docfuzz/fuzz.mjs`) is stable over 55k random cases:
  - per line: drop control chars, NUL and BOM; tabs to spaces; trim both ends
    (no indented line survives, so no code blocks, lists or code heuristics);
    `` `` `` → “ and `''` → ” (what gofmt itself does);
  - collapse blank-line runs; flag names to one line;
  - a description paragraph that gofmt could reinterpret (a lone heading-like
    line, an all-link-definition block, or one starting `Deprecated: `) is
    joined to the paragraph before it.
