# Number flags default to double; `int` is opt-in

LaunchDarkly has one number type, but the Go and Java SDKs each have two
methods (`IntVariation`/`Float64Variation`, `intVariation`/`doubleVariation`),
so the generator has to pick one per flag. We default every number flag to
`double` (Go `float64`, Java `double`, TS `number`), because a number value is
JSON data and that is what a JSON number parses to on each platform. A flag
opts into `int` with the custom property `codegen.number: int`, which is a
hard error if any variation isn't an integer or doesn't fit in 32 bits (Java's
`intVariation` is 32-bit while Go's is 64-bit).

We rejected unsigned and explicit 64-bit hints, since no SDK has such methods
and the wrapper would have to convert values itself instead of passing
through.

This is recorded because flipping the default later would change the
signature of every number accessor in every consumer's code.

Decided in "Go and Java cross-check of the flag model, naming and emitter
interface" (tarqd/launchdarkly-codegen#10).
