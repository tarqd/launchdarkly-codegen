# Each target declares its own config keys, parsed when the config loads

A target's own keys (go's `package`, dotnet's `namespace`, java's `package`)
used to reach `emit` untyped, through an index signature on `TargetConfig`,
and each emitter validated them there. So those errors came later than every
other config error and in a different format (`go target: …` rather than
`<config path>: targets[i]…`), and every new target copied the pattern.

Now an emitter is `Emitter<D>`, where `D` declares its keys: a record of
`targetOption({ type, required, description, example, parse })`, one per key.
It can also declare `outExtensions`, the endings `out` may have. Config
loading checks every configured target against its emitter, before
`--target` narrows the list:

- a key that is neither `id`, `out`, `sdkMajor` nor a declared option is an
  error;
- `out` must end in one of `outExtensions`;
- each option's type is checked and a missing required option fails with its
  example, then `parse` runs the target's own rules.

Every error is `<config path>: targets[i].<key> …`, exit 2. `emit` gets
`TargetConfig<O>`, with `options: O` inferred from the declarations, and
never fails on config. The descriptions and examples are data: a test keeps
DESIGN.md's table of target options in step with them, and config docs or a
JSON Schema for the config file can be generated from them later.

We rejected:

- an options parser registered apart from the emitter, which is a second
  list to keep in step with the emitters;
- binding each parsed target's options into an `emit` closure, which types
  the pairing exactly but takes `emit` and `readFlags` off the emitter;
- one free-form `parseOptions` with a separate list of keys, since the two
  can disagree;
- zod (or another schema library) for the options alone: the real rules (Go
  keywords, C# keyword segments, reserved Java words) are custom checks with
  our own messages either way, and the `Emitter` interface would expose the
  library's types. Moving the whole config to a schema library is possible
  later, as one change;
- validating only the targets `--target` selects, which would let a broken
  target hide until someone runs it.

Consequences: a config with a misspelled or stray target key, or a ts-server
`out` that isn't `.ts`, `.mts` or `.cts`, now exits 2 where it used to run. A
new target's options are validated and documented without changes to the
CLI.
