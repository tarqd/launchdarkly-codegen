# go

For the Go server SDK, `github.com/launchdarkly/go-server-sdk/v7`.

```yaml
targets:
  - id: go
    out: internal/ldflags/flags_gen.go
    package: ldflags   # required
    sdkMajor: 7
```

## Usage

```go
client, _ := ld.MakeClient(sdkKey, 5*time.Second)
flags := ldflags.New(client)

enabled, err := flags.CheckoutV2(context, false)
enabled, err = flags.CheckoutV2Ctx(ctx, context, false)        // with a context.Context
enabled, detail, err := flags.CheckoutV2Detail(context, false) // with the evaluation reason
_ = ldflags.KeyCheckoutV2                                      // "checkout-v2"
```

`New` takes the generated `Client` interface, the subset of the SDK client the
wrapper calls, which `*ld.LDClient` satisfies. That also makes it easy to fake
in tests. The generated file doesn't import the SDK itself.

Identifiers are exported UpperCamel with Go's initialisms: `api-url-id`
becomes `APIURLID`. Each flag gets `Ctx`, `Detail` and `DetailCtx` variants and
a `Key…` constant. Deprecated flags get a `Deprecated:` paragraph.

## Generated output

<<< ../../fixtures/golden/go/flag-kinds.go
