# .NET deprecation uses one fixed diagnostic id, `LDFLAG001`, on .NET 5+

A deprecated flag's generated members carry `[System.Obsolete]`. Plain
`Obsolete` reports CS0618, and a consumer building with
`TreatWarningsAsErrors` can then only silence every obsolete API at once,
the BCL's and other libraries' included. So on .NET 5+ the attribute also sets
`DiagnosticId = "LDFLAG001"` and `UrlFormat` to the flag's LaunchDarkly UI
link, which lets a consumer suppress, or downgrade, exactly the flag
deprecations. `DiagnosticId` doesn't exist before .NET 5, and the output
supports netstandard2.0 and net462 (C# 7.3), so each deprecated member has an
`#if NET5_0_OR_GREATER` / `#else` pair and older frameworks get plain CS0618.

We rejected a distinct id per flag, since ids would shift as flags are added
and removed and break the "deprecation doesn't churn" rule, and a
configurable id until someone needs it.

This is recorded because the id ends up in consumers' `NoWarn` lists and
`#pragma` lines: changing it later would silently re-break their builds.
