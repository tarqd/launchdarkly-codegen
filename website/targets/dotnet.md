# dotnet

For the .NET server SDK, `LaunchDarkly.ServerSdk` 8.x.

```yaml
targets:
  - id: dotnet
    out: src/MyApp/FeatureFlags/Flags.g.cs
    namespace: MyApp.FeatureFlags   # required
    sdkMajor: 8
```

## Usage

```csharp
var flags = new Flags(new LdClient(sdkKey));

bool enabled = flags.CheckoutV2(context, false);
EvaluationDetail<bool> detail = flags.CheckoutV2Detail(context, false);
string key = FlagKeys.CheckoutV2; // "checkout-v2"
```

`Flags` takes an `ILdClient`. Identifiers are UpperCamel following the .NET
design guidelines (`api-url-id` becomes `ApiUrlId`). JSON flags return
`LdValue`.

Deprecated flags get `[Obsolete]`. On .NET 5 and later it carries the
diagnostic ID `LDFLAG001` and a link to the flag, so you can silence it with
`<NoWarn>LDFLAG001</NoWarn>` without hiding other obsolete warnings, even
under `TreatWarningsAsErrors`.

## Generated output

<<< ../../fixtures/golden/dotnet/flag-kinds.g.cs
