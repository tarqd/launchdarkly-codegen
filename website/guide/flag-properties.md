# Flag properties

Everything the generator writes comes from the flag in LaunchDarkly. A few
[custom properties](https://docs.launchdarkly.com/home/flags/custom-properties)
let you adjust the output without touching config.

## What becomes the doc comment

Each generated method's doc comment has the flag's name and description, its
key, a link to the flag in the LaunchDarkly UI, its tags and its maintainer
(member or team).

## Value types

The type of a flag's methods follows from its variation values, the same way
LaunchDarkly infers it:

| Variations | Kind | TypeScript | Go | Java | .NET |
|---|---|---|---|---|---|
| booleans | boolean | `boolean` | `bool` | `boolean` | `bool` |
| strings only | string | `string` | `string` | `String` | `string` |
| numbers only | number | `number` | `float64` | `double` | `double` |
| numbers, with `codegen.number: int` | number | `number` | `int` | `int` | `int` |
| anything else | JSON | `unknown` | `ldvalue.Value` | `LDValue` | `LdValue` |

String flags stay `string`: variations can be added at any time, so the
generator never narrows them to the current values.

## `codegen.name`: choosing an identifier

By default a flag's identifier is its key converted to the target's casing
(`checkout-v2.new_flow` becomes `checkoutV2NewFlow`, `CheckoutV2NewFlow`, …).
`codegen.name` overrides it. Each value is either:

- `<target>:<Name>`, which sets the name for one target, or
- a bare `<Name>`, which sets it for every target without its own value.

So `twoFactor`, `go:TwoFactorEnabled` and `dotnet:TwoFactorEnabled` name the
flag `TwoFactorEnabled` in Go and .NET and `twoFactor` everywhere else.

The generator never invents a name. When a converted key is a reserved word,
starts with a digit, or collides with another generated name, generation
fails, names the flag, and suggests a `codegen.name` value to add.

## `codegen.number`: integer flags

Number flags are doubles by default. Set `codegen.number` to the single value
`int` to generate integer methods. Every variation must then be an integer
that fits in 32 bits.

## `codegen.deprecated`: deprecating a flag

A flag marked deprecated in LaunchDarkly, or with any `codegen.deprecated`
value, gets its language's deprecation annotation (`@deprecated`,
`Deprecated:`, `@Deprecated`, `[Obsolete]`), so callers see a warning. The
property's values, joined with spaces, become the deprecation message:

```
codegen.deprecated: Use search-v2. Removal planned for Q4 2026.
```

Archived flags are not generated at all.
