# .NET server-side SDK: research for the C# emitter

Researched 2026-10-10. Primary sources only. Abbreviations used below:

- **S** = `https://github.com/launchdarkly/dotnet-core/blob/LaunchDarkly.ServerSdk-v8.17.2/pkgs/sdk/server` (tag commit `2cbd6ffeba5f06e8047671a2c7e1d7f110a6096d`)
- **C** = `https://github.com/launchdarkly/dotnet-core/blob/LaunchDarkly.CommonSdk-v7.2.0/pkgs/shared/common/src` (`git diff` against the server tag shows no changes under `pkgs/shared/common/src`)
- **ML** = `https://learn.microsoft.com/en-us/dotnet` (I read the Markdown source in `dotnet/docs` at `47c421406a98`)

## Repository location

- `launchdarkly/dotnet-server-sdk` is marked `[DEPRECATED]`: "Development has moved to dotnet-core repository … pkgs/sdk/server". Source: https://github.com/launchdarkly/dotnet-server-sdk/blob/main/README.md
- `launchdarkly/dotnet-sdk-common` is also deprecated and has moved to `dotnet-core`. Source: https://github.com/launchdarkly/dotnet-sdk-common/blob/main/README.md

## 1. Package coordinates

| Fact | Value | Source |
|---|---|---|
| NuGet id | `LaunchDarkly.ServerSdk` | S/src/LaunchDarkly.ServerSdk.csproj#L16 |
| Latest version | **8.17.2**, released 2026-10-05. It is the last entry in the NuGet version index. | https://api.nuget.org/v3-flatcontainer/launchdarkly.serversdk/index.json ; S/CHANGELOG.md#L3 |
| Current major | 8 (8.0.0 released 2023-10-16) | S/CHANGELOG.md#L264 |
| Target frameworks | `netstandard2.0;net462;net8.0` | S/src/LaunchDarkly.ServerSdk.csproj#L10 ; nuspec dependency groups `.NETFramework4.6.2`, `net8.0`, `.NETStandard2.0`: https://api.nuget.org/v3-flatcontainer/launchdarkly.serversdk/8.17.2/launchdarkly.serversdk.nuspec |
| SDK's own LangVersion | `7.3` | S/src/LaunchDarkly.ServerSdk.csproj#L18 |
| CommonSdk dependency | `LaunchDarkly.CommonSdk` **7.2.0** (major 7; 7.2.0 is the latest on NuGet) | S/src/LaunchDarkly.ServerSdk.csproj#L55 ; nuspec above ; https://api.nuget.org/v3-flatcontainer/launchdarkly.commonsdk/index.json |
| Other dependencies | LaunchDarkly.Cache 1.0.2, EventSource 6.0.0, InternalSdk 3.11.1, Logging 2.1.0, plus System.Text.Json 6.0.10 and System.Collections.Immutable 1.7.1 on netstandard2.0/net462 | nuspec above |
| Namespaces | `LaunchDarkly.Sdk` (Context, LdValue, EvaluationDetail): C/Context.cs#L10, C/EvaluationDetail.cs#L4, C/LdValue.cs#L10. `LaunchDarkly.Sdk.Server` (LdClient, Configuration): S/src/LdClient.cs#L23. `LaunchDarkly.Sdk.Server.Interfaces` (ILdClient): S/src/Interfaces/ILdClient.cs#L5 | |
| Supported platforms (docs) | "version 8.9 and higher, is compatible with .NET 8"; "version 7.0 and higher, is compatible with .NET 6.0+, .NET Framework 4.6.2+, .NET Standard 2.0+, and .NET Core 3.1" | https://launchdarkly.com/docs/sdk/server-side/dotnet (the docs.launchdarkly.com URL redirects here) |

**Support / EOL.** A version reaches EOL "one year after we release the subsequent version" (https://launchdarkly.com/docs/sdk/concepts/versioning, "End of life behavior"). The supported-versions table lists 8.17.x as Current and 8.10.x as the oldest line still supported (EOL 2027-01-12). **7.x reached EOL on 2024-10-16, so no prior major is supported.** Source: https://launchdarkly.com/docs/sdk/concepts/supported-versions (".NET server SDK" accordion).

## 2. Client type to accept

- `public interface ILdClient` is in `LaunchDarkly.Sdk.Server.Interfaces`. Its summary reads "Interface defining the public methods of LdClient". Source: S/src/Interfaces/ILdClient.cs#L5-L10
- `public sealed class LdClient : IDisposable, ILdClient` is in `LaunchDarkly.Sdk.Server`. Source: S/src/LdClient.cs#L29. Its constructors are `LdClient(Configuration config)` (#L128) and `LdClient(string sdkKey)` (#L267).
- **ILdClient contains every typed variation method and its Detail variant** (see §3), plus `MigrationVariation`, `Identify`, `Track`, `AllFlagsState`, `Flush` and others. `ILdClient` does **not** extend `IDisposable`; `LdClient` does. Source: S/src/Interfaces/ILdClient.cs
- Recommendation: the wrapper should accept `ILdClient`. `LdClient` is `sealed`, so taking the interface is the only way to substitute a test double.
- Existing helpers: the extension methods `EnumVariation<T>(this ILdClient, string key, Context context, T defaultValue)` and `EnumVariationDetail<T>` parse a string flag into an enum, ignoring case, and return the default on failure. Source: S/src/ILdClientExtensions.cs#L23-L60, #L83

## 3. Typed variation methods (exact signatures from ILdClient)

From S/src/Interfaces/ILdClient.cs:

```csharp
bool                     BoolVariation       (string key, Context context, bool defaultValue = false); // L77
EvaluationDetail<bool>   BoolVariationDetail (string key, Context context, bool defaultValue);         // L97
int                      IntVariation        (string key, Context context, int defaultValue);          // L123
EvaluationDetail<int>    IntVariationDetail  (string key, Context context, int defaultValue);          // L143
float                    FloatVariation      (string key, Context context, float defaultValue);        // L165
EvaluationDetail<float>  FloatVariationDetail(string key, Context context, float defaultValue);        // L186
double                   DoubleVariation     (string key, Context context, double defaultValue);       // L208
EvaluationDetail<double> DoubleVariationDetail(string key, Context context, double defaultValue);      // L229
string                   StringVariation     (string key, Context context, string defaultValue);       // L251
EvaluationDetail<string> StringVariationDetail(string key, Context context, string defaultValue);      // L271
LdValue                  JsonVariation       (string key, Context context, LdValue defaultValue);      // L292
EvaluationDetail<LdValue> JsonVariationDetail(string key, Context context, LdValue defaultValue);      // L312
MigrationVariation       MigrationVariation  (string key, Context context, MigrationStage defaultStage); // L322
```

- The parameter names are always `key`, `context` and `defaultValue`. **Only `BoolVariation` has a default parameter value (`= false`).** `BoolVariationDetail` and all other methods have none. `LdClient` repeats `= false` on its implementation. Source: S/src/LdClient.cs#L282-L327
- The context type is `LaunchDarkly.Sdk.Context`, a `readonly struct`. Source: C/Context.cs#L44
- **There are no `User` overloads in v8.** The 8.0.0 changelog says "Remove support for `User` in `LdClient` methods. The `Context.FromUser` method can be used to convert a `User` to a `Context`." Source: S/CHANGELOG.md#L276. `User` and `Context.FromUser(User)` still exist in CommonSdk: C/User.cs#L58, C/Context.cs#L402
- **There are no async variants.** The only public `*Async` or `Task` API outside `Internal/` is the persistent-store plug-in interface `IPersistentDataStoreAsync`. Source: S/src/Subsystems/IPersistentDataStoreAsync.cs#L16 (I grepped all public sources). The docs list only the six synchronous `*Variation` methods: https://launchdarkly.com/docs/sdk/features/evaluating (".NET (server-side)").
- `int` is `System.Int32`, a signed 32-bit integer. Source: ML/csharp/language-reference/builtin-types/integral-numeric-types. The SDK has no `long` variation method. `LdValue.Convert.Long` and `AsLong` exist only on LdValue (C/LdValue.cs#L390, #L1061).
- **IntVariation with a non-integral number.** The implementation uses `LdValue.Convert.Int` (S/src/LdClient.cs#L286-L287), which calls `AsInt => (int)Math.Round(AsDouble, MidpointRounding.ToEven)` (C/LdValue.cs#L372). The result is **rounded to the nearest integer, with ties going to the even number** (banker's rounding, so 2.5 → 2 and 3.5 → 4).
  - The ILdClient doc says "rounded to the nearest integer. This rounding behavior may be changed in a future version … so you should avoid relying on it" (S/src/Interfaces/ILdClient.cs#L104-L107).
  - The `AsInt` XML doc contradicts the code: it says "rounded toward zero" (C/LdValue.cs#L365).
  - Out-of-range values: a `(int)` cast of a `double` in an unchecked context gives "an unspecified value of the destination type". Source: ML/csharp/language-reference/builtin-types/numeric-conversions ("Explicit numeric conversions").
- **Type check.** When `defaultValue` is not JSON null and the flag value's `LdValueType` differs from the default's type, the SDK logs an error and returns the default with reason `ERROR`/`WRONG_TYPE`. Source: S/src/LdClient.cs#L514-L524. Int, float and double defaults all have type Number, so an int flag holding 1.5 passes the check and is then rounded. **A `null` string default turns the type check off**: `LdValue.Of((string)null)` is Null, and a non-string value then converts to `null` through `AsString` (C/LdValue.cs#L354).
- `JsonVariation` and `JsonVariationDetail` pass `checkType=false`. Source: S/src/LdClient.cs#L302-L303, #L326-L327

## 4. Context propagation

- **There is no equivalent of Go's `…Ctx` variants: no `CancellationToken` parameter, no `Task`-returning evaluation methods, and no ambient-context overloads** (see §3). All evaluation is synchronous against the local flag store.
- "Context" in this SDK means the evaluation context (`LaunchDarkly.Sdk.Context`), not a cancellation or request context.
  - `Context.New(string key)` creates a context of the default kind "user" (C/Context.cs#L284).
  - `Context.New(ContextKind kind, string key)` (#L307) and `Context.NewMulti(params Context[])` (#L354) create custom-kind and multi-kind contexts.
  - Builders: `Context.Builder(string key)` (#L492), `Context.Builder(ContextKind, string)` (#L506) and `Context.MultiBuilder()` (#L528). `ContextBuilder` provides `Kind`, `Key`, `Name`, `Anonymous`, `Set(name, LdValue|bool|int|double|long|string)`, `Private(...)` and `Build()` (C/ContextBuilder.cs#L60-L425).
  - `ContextKind.Of(string)` (C/ContextKind.cs#L79).
  - `context.Valid` and `context.Error` report a malformed context (C/Context.cs#L105, #L115).
  - Docs example: `Context.Builder("example-context-key")…`, https://launchdarkly.com/docs/sdk/server-side/dotnet

## 5. Doc comments and deprecation

- XML doc comments use the `///` single-line delimiter (or `/** */`) and contain XML elements such as `<summary>`. Source: ML/csharp/language-reference/xmldoc/ ("Create XML documentation output", "XML comment formats").
- Tags: `<summary>`, `<remarks>`, `<returns>`, `<param name="…">`, `<para>`, `<c>`, `<see href="link">Link Text</see>` ("Use `href` instead of `cref` when linking to external web pages") and `<inheritdoc/>`. Source: ML/csharp/language-reference/xmldoc/recommended-tags
- Escaping: "The documentation must be well-formed XML. If the XML isn't well formed, the compiler generates a warning" (recommended-tags, "General tags" preamble). Write literal angle brackets as `&lt;` and `&gt;` (ML/csharp/language-reference/xmldoc/, "XML comment formats"). Escape `&` as `&amp;`, since a bare `&` is not well-formed XML (W3C XML 1.0 §2.4, https://www.w3.org/TR/xml/#syntax).
- The `*/` rules apply only to the `/** */` form (xmldoc index, "XML comment formats"). **With `///` comments, `*/` has no special meaning.** Each emitted line must start with `///`, so the generator must split multi-line descriptions and prefix every line.
- `[Obsolete("msg")]` "marks a code element as no longer recommended for use. Use of an entity marked obsolete generates a warning or an error." `[Obsolete("msg", true)]` makes it an error. Source: ML/csharp/language-reference/attributes/general#obsolete-and-deprecated-attribute ; C# spec §23.5.4, https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/language-specification/attributes#2354-the-obsolete-attribute
- Diagnostic IDs: **CS0618** "'member' is obsolete: 'text'" is a level 2 warning raised when a message is supplied (ML/csharp/language-reference/compiler-messages/cs0618). **CS0612** "'member' is obsolete" is the level 1 warning for `[Obsolete]` without a message (ML/csharp/misc/cs0612).
- Under `<TreatWarningsAsErrors>true</TreatWarningsAsErrors>`, "All warning messages are instead reported as errors. The build process halts" (ML/csharp/language-reference/compiler-options/errors-warnings#treatwarningsaserrors). **So any consumer call to an `[Obsolete]` generated member breaks a TreatWarningsAsErrors build** unless the consumer adds CS0618 to `WarningsNotAsErrors` or `NoWarn`, or uses `#pragma warning disable CS0618`.
- **Is usage inside the generated class itself suppressed?** Only when the *referencing* symbol, or one of its containing symbols, is itself obsolete.
  - Roslyn walks the containing-symbol chain. It returns `Suppressed` when some symbol in that chain is obsolete ("If we are in a context that is already experimental/obsolete, there is no point reporting more … diagnostics"). Otherwise it reports the diagnostic. Source: https://github.com/dotnet/roslyn/blob/ad34e675fc51beef49d66cb8005af3752895727d/src/Compilers/CSharp/Portable/Symbols/ObsoleteAttributeHelpers.cs (`GetObsoleteContextState` L59-L96, `getDiagnosticKind` L130-L145)
  - In practice: an `[Obsolete] const string FooKey` referenced from an `[Obsolete]` method `Foo()` does **not** warn. The same const referenced from a non-obsolete member of the same class **does** warn (CS0618), and so does any reference from a non-obsolete member elsewhere. Being in the same class does not suppress the warning by itself.
  - I found no Microsoft Learn page that states this suppression rule; the Roslyn source is the primary evidence.
- **CS1591** "Missing XML comment for publicly visible type or member" (level 4) is reported when DocumentationFile is set (ML/csharp/language-reference/compiler-messages/cs1591). Setting `GenerateDocumentationFile` (or `DocumentationFile`) makes "the compiler generate[s] the CS1591 warning for any publicly visible member … without XML documentation comments" (ML/csharp/language-reference/xmldoc/, "Create XML documentation output"; ML/core/project-sdk/msbuild-props#generatedocumentationfile).
- **CS1591 is not suppressed in generated code**: "Generated code files are excluded only from code analysis diagnostics. Other diagnostics, such as those from the C# compiler, aren't affected" (ML/fundamentals/code-analysis/configuration-options#exclude-generated-code). The generator should therefore document every public member, including constants, the constructor and the class.
- The SDK applies the same discipline to itself: `<WarningsAsErrors>1570,…,1591,…</WarningsAsErrors>` (S/src/LaunchDarkly.ServerSdk.csproj#L37).

## 6. Reserved words and identifier grammar

**Reserved keywords** (77, C# spec §6.4.4; https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/language-specification/lexical-structure#644-keywords ; ML/csharp/language-reference/keywords/):

`abstract as base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly ref return sbyte sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using virtual void volatile while`

**Contextual keywords** (Learn list, current as of 2026-06; a superset of the spec's 30):

`add allows alias and ascending args async await by closed descending dynamic equals extension field file from get global group init into join let managed nameof nint not notnull nuint on or orderby partial record remove required safe scoped select set unmanaged value var when where with yield`

Contextual keywords "can be used as identifiers outside that context" (ML keywords page), but escaping them is harmless. Some are risky as member names: `field`, which has meaning inside property accessors in C# 14, and `value`, which has meaning in setters. **Recommendation: `@`-escape the union of both lists.**

- **Verbatim identifier:** a `@` prefix lets a keyword be used as an identifier (`@if`). "The character `@` is not actually part of the identifier". Using `@` on non-keywords "is permitted, but strongly discouraged". Source: spec §6.4.3, https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/language-specification/lexical-structure#643-identifiers ; ML/csharp/language-reference/tokens/verbatim
- **Identifier grammar** (spec §6.4.3):
  - Start character: a letter (`\p{L}` or `\p{Nl}`) or `_`.
  - Part characters: letters, decimal digits (`Nd`), connecting characters (`Pc`), combining characters (`Mn`, `Mc`) and formatting characters (`Cf`).
  - Identifiers must be in Unicode NFC.
  - Identifiers containing `__` are "reserved for use by the implementation", though no diagnostic is required.
  - Learn adds: "Anything outside that is automatically replaced using `_`" (ML/csharp/fundamentals/coding-style/identifier-names).
- **System.Object members** a generated member could collide with: `Equals`, `Finalize`, `GetHashCode`, `GetType`, `MemberwiseClone`, `ReferenceEquals`, `ToString`. Source: https://learn.microsoft.com/en-us/dotnet/api/system.object (member list from `dotnet/dotnet-api-docs` `xml/System/Object.xml`).
  - A same-named member with a different signature becomes an overload.
  - A same signature hides the base member. Hiding the virtual `ToString()` gives warning CS0114; hiding the non-virtual `GetType()` gives warning CS0108. Sources: ML/csharp/misc/cs0114 ; ML/csharp/language-reference/compiler-messages/cs0108
  - **Recommendation: suffix or rename these names.**
- **A member cannot have the same name as its enclosing type** (error CS0542). Source: ML/csharp/misc/cs0542. A flag whose PascalCase name equals the generated class name must be renamed.

## 7. .NET naming conventions

- PascalCase applies to namespaces, types, methods, properties, events, fields (including `const`) and enum values. camelCase applies to parameters. Source: ML/standard/design-guidelines/capitalization-conventions (table "capitalization rules for different types of identifiers").
- **Acronyms:** in PascalCase, capitalize the first character of each word "including acronyms over two letters in length" (`HtmlTag`). "A special case is made for two-letter acronyms in which both letters are capitalized" (`IOStream`). In camelCase a leading two-letter acronym is all lowercase (`ioStream`). Source: same page, "Capitalization Rules for Identifiers".
- **`Id` is a word, not an acronym:** the compound-terms table lists Pascal `Id`, camel `id`, Not `ID`. It also lists `Ok` (not `OK`), `Email`, `Endpoint` and `Metadata`. Source: same page, "Capitalizing Compound Words and Common Terms". So the generator should produce `Api`, `Url`, `Http`, `Json` (3+ letters) and `Id`, but `IO` and `UI`.
- Field names: "DO use PascalCasing in field names … DO NOT use a prefix". Method names should be verbs or verb phrases. Source: ML/standard/design-guidelines/names-of-type-members
- Prefer CLR type names (`Int64`, not `Long`) when an identifier has no meaning beyond its type. Source: ML/standard/design-guidelines/general-naming-conventions ("Avoiding Language-Specific Names")
- Constants are PascalCase even when private. Source: ML/csharp/fundamentals/coding-style/identifier-names
- Names cannot differ only by case: "Any APIs that are externally accessible … cannot rely on case alone". Source: capitalization-conventions, "Case Sensitivity". See also CA1708. **The generator's dedupe must compare names case-insensitively.**

## 8. Formatter, strict build settings, analyzers, generated code

**dotnet format** (ML/core/tools/dotnet-format):
- It reads `.editorconfig` if one is present; "otherwise a default set of preferences will be used".
- Subcommands are `whitespace`, `style` and `analyzers`.
- `--verify-no-changes` "Terminates with a non zero exit code if any files would have been formatted".
- `--severity` defaults to `warn`.
- `--include-generated` "Formats files generated by the SDK".

**MSBuild properties:**
- `<Nullable>enable</Nullable>` accepts `enable|disable|warnings|annotations`. The default is `disable`, but .NET 6+ templates set `enable`. Source: ML/csharp/language-reference/compiler-options/language#nullable
- `<TreatWarningsAsErrors>true</TreatWarningsAsErrors>` treats all compiler warnings as errors; `WarningsNotAsErrors` exempts specific ones. Source: ML/csharp/language-reference/compiler-options/errors-warnings#treatwarningsaserrors
- `-warnaserror` also covers CA warnings, and `CodeAnalysisTreatWarningsAsErrors=false` opts out. Source: ML/core/project-sdk/msbuild-props#codeanalysistreatwarningsaserrors
- `<AnalysisLevel>latest-all</AnalysisLevel>` (the form is `<version>-<mode>`) is equivalent to `<AnalysisMode>All</AnalysisMode>`, under which "All rules are enabled as build warnings". The exceptions are CA1017, CA1045, CA1005, CA1014, CA1060, CA1021 and the metrics rules. Sources: ML/core/project-sdk/msbuild-props#analysislevel, #analysismode
- `AnalysisLevel` and `AnalysisMode` also affect IDE rules when `EnforceCodeStyleInBuild` is true. Source: msbuild-props#analysislevel note.
- `<EnforceCodeStyleInBuild>true</EnforceCodeStyleInBuild>` runs IDExxxx style rules on build; it is off by default. Source: ML/core/project-sdk/msbuild-props#enforcecodestyleinbuild
- `<GenerateDocumentationFile>true</GenerateDocumentationFile>` turns on CS1591 (§5). Source: msbuild-props#generatedocumentationfile

**Rules likely to fire on a simple wrapper class under `AnalysisMode=All` (all "Enabled by default: No" in .NET 10 unless noted):**

| Rule | Why it would fire | Source |
|---|---|---|
| CA1062 Validate arguments of public methods | Fires when a public method dereferences a reference-type argument without a null check, for example a `string` parameter, or an `ILdClient` argument that is used rather than just stored. `Context` is a struct, so it is unaffected. | ML/fundamentals/code-analysis/quality-rules/ca1062 |
| CA1822 Mark members as static | Fires on a helper that does not touch `_client`. Enabled "As suggestion" by default. | …/quality-rules/ca1822 |
| CA1034 Nested types should not be visible | Fires on public nested classes, for example per-flag key holders. Nested enums are exempt. | …/quality-rules/ca1034 |
| CA1724 Type names should not match namespaces | Fires when the generated class name matches a referenced namespace (case-insensitive comparison), for example `Server` or `Interfaces`. | …/quality-rules/ca1724 |
| CA1716 Identifiers should not match keywords | Checks namespaces, types, and virtual/interface members against keywords of CLR languages. VB keywords are compared case-insensitively. Non-virtual members of a sealed class are not checked. | …/quality-rules/ca1716 |
| CA1720 Identifiers should not contain type names | Fires when a name token matches `Bool`, `Int`, `Integer`, `Long`, `Float`, `Short`, …; parameters are also checked against `String`, `Object`, `Double`, `Guid`, …. **This directly hits flag names such as `maxInt` → `MaxInt`.** | …/quality-rules/ca1720 |
| CA1707 Identifiers should not contain underscores | Fires on names such as `Flag_Key`. | …/quality-rules/ca1707 |
| CA1708 Identifiers should differ by more than case | Fires on two flags that differ only by case. | …/quality-rules/ca1708 |
| CA1711 Incorrect suffix | Fires on suffixes such as `…Flag` or `…Flags` on **enum** types, and on `Collection`, `Dictionary`, `Impl`, `Ex`, `New`, …. | …/quality-rules/ca1711 |
| CA1052 Static holder types should be static | Fires on a keys-only class that is not declared `static`. | …/quality-rules/ca1052 |
| CA1050 Declare types in namespaces | Fires if the generator emits no namespace. Enabled "As suggestion". | …/quality-rules/ca1050 |
| CA1515 Consider making public types internal | Fires only in **executable** assemblies. | …/quality-rules/ca1515 |
| IDE0290 Use primary constructor | Fires on C# 12+ when a class has a ctor that only assigns fields. Option `csharp_style_prefer_primary_constructors`, default `true`. | ML/fundamentals/code-analysis/style-rules/ide0290 |
| CS8632 | A `string?` annotation in a file whose nullable context is disabled, which is **the default for generated files** (see below). This is a compiler warning. | ML/csharp/language-reference/compiler-messages/nullable-warnings |

**How generated code is treated (important):**

1. **Detection heuristic** (Roslyn `GeneratedCodeUtilities.IsGeneratedCodeFile` / `BeginsWithAutoGeneratedComment`). A file counts as generated when any of these holds:
   - its name starts with `TemporaryGeneratedFile_`;
   - its name without the extension ends in `.designer`, `.generated`, `.g` or `.g.i` (case-insensitive);
   - its leading trivia (comments before the first token) contains `<autogenerated` or `<auto-generated`;
   - an `.editorconfig` `generated_code = true|false` entry, which overrides the heuristic.

   Source: https://github.com/dotnet/roslyn/blob/ad34e675fc51beef49d66cb8005af3752895727d/src/Compilers/Core/Portable/SourceGeneration/GeneratedCodeUtilities.cs (L16, L61-L85, L88-L115, L148-L172) ; override precedence: https://github.com/dotnet/roslyn/blob/ad34e675fc51beef49d66cb8005af3752895727d/src/Compilers/CSharp/Portable/Syntax/CSharpSyntaxTree.cs#L723-L745 ; docs: ML/fundamentals/code-analysis/configuration-options#exclude-generated-code
2. **Analyzers skip generated code, per analyzer.** Each analyzer calls `ConfigureGeneratedCodeAnalysis(flags)`.
   - With `GeneratedCodeAnalysisFlags.None`, the driver neither calls the analyzer back nor reports its diagnostics in generated code. Source: https://github.com/dotnet/roslyn/blob/ad34e675fc51beef49d66cb8005af3752895727d/src/Compilers/Core/Portable/DiagnosticAnalyzer/DiagnosticAnalysisContext.cs#L273-L297
   - Built-in IDE code-style analyzers default to `None`. Source: https://github.com/dotnet/roslyn/blob/ad34e675fc51beef49d66cb8005af3752895727d/src/Analyzers/Core/Analyzers/AbstractBuiltInCodeStyleDiagnosticAnalyzer_Core.cs#L73-L79
   - In the .NET SDK's NetAnalyzers (CA rules), 182 call sites use `None`, 6 use `Analyze` without reporting (CA1724 is one), and 52 use `Analyze | ReportDiagnostics`. The last group is mostly Security plus CA1418/1420/1421/2252/2256-2258/2015/2100; none is relevant to a wrapper.
   - CA1062, CA1716, CA1720, CA1034 and CA1822 all use `None`. Source: https://github.com/dotnet/sdk/tree/186ac691d44955c7dd75731b882318ab039be8b7/src/Microsoft.CodeAnalysis.NetAnalyzers/src/Microsoft.CodeAnalysis.NetAnalyzers (for example `Microsoft.CodeQuality.Analyzers/QualityGuidelines/ValidateArgumentsOfPublicMethods.cs`)
   - Docs: "In most cases, code analyzers skip generated code files".
3. **Compiler diagnostics are not affected**: CS0618, CS1591 and CS0108 still fire in generated files (configuration-options#exclude-generated-code note).
4. **dotnet format skips generated files** unless `--include-generated` is passed: `if (IsGeneratedCodeAsync(...)) { if (!IncludeGeneratedFiles) continue; }`. It uses the same heuristic. Source: https://github.com/dotnet/sdk/blob/186ac691d44955c7dd75731b882318ab039be8b7/src/Dotnet.Format/dotnet-format/CodeFormatter.cs#L232-L242 and `Utilities/GeneratedCodeUtilities.cs`. This means `dotnet format --verify-no-changes` **does not check** a `.g.cs` file or one with an `<auto-generated/>` header. To check the generator's own formatting, test with `--include-generated`, or emit the file without the marker.
5. **The nullable context is disabled in generated files**, whatever `<Nullable>` says: "Regardless of this setting, the nullable context is *disabled* for any source file marked as generated … Generators can opt in by using the `#nullable` preprocessor directive." Source: ML/csharp/language-reference/compiler-options/language#nullable (IMPORTANT box). **A generated file that uses `string?` must emit `#nullable enable`** (after the header comment), or it gets CS8632. Under TreatWarningsAsErrors, CS8632 is an error.

## 9. Nullable reference types in the SDK

- The SDK is **not nullable-annotated**.
  - Both the server SDK and CommonSdk compile with `LangVersion 7.3`, which predates nullable reference types. CommonSdk uses 9.0 only on net7+ for the System.Text.Json source generator. Sources: S/src/LaunchDarkly.ServerSdk.csproj#L18 ; C/LaunchDarkly.CommonSdk.csproj#L15-L17
  - Neither csproj sets `<Nullable>`, and there are no `#nullable` directives in either `src` tree (grep).
- `StringVariation(string key, Context context, string defaultValue)` therefore has an **oblivious** `string` parameter and return type. The doc comment says "`defaultValue` is nullable, you should assume that the return value might be null". Source: S/src/Interfaces/ILdClient.cs#L238-L251
- Check by metadata inspection (my own, using `dnfile` on the 8.17.2 nupkg `lib/net8.0` DLLs). `NullableAttribute` and `NullableContextAttribute` appear only on compiler-generated closure members in LaunchDarkly.ServerSdk.dll, and only on the source-generated `LdJsonSerializerContext` in LaunchDarkly.CommonSdk.dll. They do not appear on `ILdClient`, `LdClient`, `LdValue` or `Context`. The netstandard2.0 and net462 DLLs have none.
- Consequence for the wrapper: with `#nullable enable`, passing `string?` into the oblivious `string defaultValue` gives no warning. The wrapper chooses the nullability of its own return type: either `string?` (honest) or `string` with a non-null default.

## 10. Other relevant types

- `LdValue` is a `public struct LdValue : IEquatable<LdValue>, IJsonSerializable` in `LaunchDarkly.Sdk` (C/LdValue.cs#L82).
  - Factories: `Of(bool|int|long|float|double|string)` (#L150-L208), `ArrayOf` (#L241), `ObjectFrom` (#L261), `BuildObject()` (#L268) and `Parse(string json)` (#L284).
  - Accessors: `Type` (#L297), `AsBool`, `AsInt`, `AsLong`, `AsFloat`, `AsDouble` and `AsString` (#L338-L420), plus `IsNumber` and `IsInt` (#L307, #L318).
  - `ToJsonString()` (#L547).
- **Typed JSON helpers:**
  - `LdValue.Convert` provides the static `Converter<T>` instances `Bool`, `Int`, `Long`, `Float`, `Double`, `String` and `Json` (C/LdValue.cs#L1019-L1110).
  - `abstract class Converter<T>` has `FromType`/`ToType` and `ArrayFrom`/`ArrayOf`/`ObjectFrom` (C/LdValue.cs#L917-L960).
  - `AsList<T>(Converter<T>)` and `AsDictionary<T>(Converter<T>)` (#L505, #L528).
  - No generic POCO deserializer exists: `LdJsonSerialization.DeserializeObject<T>` requires `T : IJsonSerializable` (C/Json/LdJsonSerialization.cs#L74). To map a JSON flag to a user type, call `LdValue.ToJsonString()` and pass the result to System.Text.Json yourself.
- `EvaluationDetail<T>` is a `public struct` (C/EvaluationDetail.cs#L11-L45) with members `T Value`, `int? VariationIndex`, `EvaluationReason Reason`, `bool IsDefaultValue` (true when `VariationIndex == null`) and the constructor `EvaluationDetail(T value, int? variationIndex, EvaluationReason reason)`.
  - `EvaluationReason` is a struct with `Kind` (an `EvaluationReasonKind`), `RuleIndex`, `RuleId`, `PrerequisiteKey`, `ErrorKind`, `InExperiment` and `BigSegmentsStatus` (C/EvaluationDetail.cs#L70-L131).

## Tooling: installing the dotnet SDK in a Linux container

- Yes, without root. "The `dotnet-install` scripts perform a non-admin installation of the .NET SDK". The Bash script is at `https://dot.net/v1/dotnet-install.sh`, which currently redirects (301) to `https://builds.dotnet.microsoft.com/dotnet/scripts/v1/dotnet-install.sh`. Its intended use is CI. Example: `./dotnet-install.sh --channel LTS`. Source: ML/core/tools/dotnet-install-script (not installed here).

## Open questions / not verified

- **Not compiled.** There is no dotnet SDK in this environment, so these points are not checked by running the compiler:
  - the CS0618 in-obsolete-context suppression;
  - CS8632 in generated files;
  - which analyzer warnings actually fire on a sample wrapper.

  All of them should be confirmed with a real `dotnet build -warnaserror` prototype.
- **Learn gap on the suppression rule.** I found no Microsoft Learn page that states the "use inside an obsolete member does not warn" rule; the evidence is Roslyn source only.
- **Contradictory rounding docs.** The `AsInt` doc says "rounded toward zero" but the code rounds half-to-even, and the ILdClient doc warns the rounding may change. Generated docs should not promise either behavior.
- **Nullable inspection is mine.** The metadata check in §9 is my own inspection, not a published LaunchDarkly statement.
- **Contextual keyword list moves.** The list changes each C# release (Learn page `ms.date` 2026-06-05); re-check it when the target LangVersion changes.
- **Docs host.** `docs.launchdarkly.com` now redirects to `launchdarkly.com/docs/...`; the supported-versions table was read on 2026-10-10.
- **Unchecked consumer interplay.** I did not check how `IDE0005` or `EnforceCodeStyleInBuild` interact with `GenerateDocumentationFile` in consumer builds.
