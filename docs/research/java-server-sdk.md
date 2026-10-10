# Java server SDK: facts for the `java` target

Date checked: 2026-10-10. This verifies and extends the Java section of
`origin/research/sdk-apis:research/sdk-apis.md`, the `### java` sketch in
`DESIGN.md`, and `origin/prototype/go-java-crosscheck:prototypes/go-java-crosscheck/java/`.

Paths used below:

- `$DL` = a scratch directory holding the downloaded artifacts, unpacked as is.
- `$T` = a scratch directory holding the small test files (not committed; each is described where
  it is used).
- `SDK` = `https://repo.maven.apache.org/maven2/com/launchdarkly/launchdarkly-java-server-sdk/`
- `GJF` = `https://repo.maven.apache.org/maven2/com/google/googlejavaformat/google-java-format/`
- `ORA` = `https://docs.oracle.com/`

"Empirical" means the result came from running the local OpenJDK 21.0.12 (`javac`, `javadoc`,
`java`) on test files in `$T`. Maven Central returned HTTP 429 now and then, so some downloads
needed retries.

## Summary

| # | Question | Answer | Source |
| --- | --- | --- | --- |
| 1 | Current release | `7.17.2` (`<latest>` and `<release>`). The newest 7.x is 7.17.2. There is no 8.x. Majors 4 (from 4.6.4), 5, 6 and 7 are listed. | `SDK/maven-metadata.xml` |
| 1 | Common types | Bundled. `com/launchdarkly/sdk/{LDContext,LDValue,EvaluationDetail}.class` are in the main jar, and the POM has `<dependencies/>`. Third-party dependencies are shaded under `com/launchdarkly/shaded/`. | `unzip -l` of the 7.17.2 jar; the `.pom` |
| 2 | Minimum Java | Java 8. The SDK classes are class-file major version 52. No README is shipped, and the manifest does not state a version. | `javap -v` |
| 3 | Client type | `public interface LDClientInterface extends Closeable`; `public final class LDClient implements LDClientInterface`. There is no narrower public evaluation-only interface. | sources jar |
| 4 | Typed methods | 10 methods, `(String key, LDContext context, T defaultValue)`. No `jsonVariation`, no `LDUser` overloads, nothing deprecated, no nullability annotations. | sources jar, `javap -v` |
| 5 | Context propagation | None. There is no `...Ctx` variant and no request-scoped parameter. The context type is `com.launchdarkly.sdk.LDContext`. | sources jar |
| 6 | `EvaluationDetail<T>` | `com.launchdarkly.sdk.EvaluationDetail` (final): `getValue()`, `int getVariationIndex()` (`NO_VARIATION = -1`), `getReason()`, `isDefaultValue()`. | `javap -constants` |
| 7 | Javadoc escaping | Must escape: `&` → `&amp;`, `<` → `&lt;`, `@` → `&#64;`, `{` → `&#123;`, `*/` → `*&#47;`, and **`\` → `&#92;`** (a `\u` is a compile error). Escaping `>` is optional. doclint accepts `<br>`, `<br/>` and a raw `&` inside `href`. It rejects an empty `<p>`, including `<p>` directly before a block tag. | JDK 21 doc-comment spec, JLS §3.3, empirical |
| 7 | `-Xdoclint:all` in javac | The default access is **private**, so private members need comments. It requires `@param`/`@return`. A comment that has only block tags warns "no main description". An implicit default constructor warns. javac does **not** report unknown `@tags`, but the `javadoc` tool does (as errors). | JDK 21 `javac` man page, empirical |
| 8 | Deprecation | `@Deprecated` has been in the JDK since 1.5. Its `since` and `forRemoval` elements arrived in **9**: under `--release 8` they are a compile error. `dep-ann` warns about a `@deprecated` tag without the annotation, but not the reverse. A use inside the same outermost class never warns. | `Deprecated` API doc, JLS §9.6.4.6, empirical |
| 9 | JLS keywords | 51 reserved keywords (including `_`) and 17 contextual ones. `true`, `false` and `null` are literals, and none of them can be an identifier. The ASCII subset `[A-Za-z_$][A-Za-z0-9_$]*` is safe, except a lone `_`. | JLS 21 §3.8, §3.9 |
| 10 | Formatter | google-java-format **1.37.0** needs **JDK 21+** (class major 65). `java -jar …-all-deps.jar` works on JDK 21 with no extra flags, because the manifest carries `Add-Exports`. It rewraps javadoc. Every prototype file fails `--set-exit-if-changed`. | `GJF/maven-metadata.xml`, jar manifest, empirical |
| 11 | Compile settings | `-Xlint:all -Xdoclint:all -Werror` passes with `--release 11` (and 9–21). `--release 8` fails `-Werror` on `[options] … obsolete` unless you add `-Xlint:-options`. `this-escape` does not fire for a final class. `-processing` is not needed. | empirical, `javac --help-lint` |

## 1. Maven coordinates, version, bundling

- `SDK/maven-metadata.xml`: `<latest>7.17.2</latest>`, `<release>7.17.2</release>`,
  `<lastUpdated>20260930205410</lastUpdated>`. There are 28 versions from 7.0.0 to 7.17.2, and the
  last 7.x is 7.17.2. There is no `8.` version. The major versions present are 4.x (21 versions,
  from 4.6.4), 5.x (47, including `5.0.0-rc1..rc3`), 6.x (11, last 6.3.0) and 7.x (28). The earlier
  research listed only majors 5, 6 and 7. It missed 4.x, which does not matter here.
- `SDK/7.17.2/launchdarkly-java-server-sdk-7.17.2.pom` has `<dependencies/>` (empty),
  `<packaging>jar</packaging>`, and `<url>https://github.com/launchdarkly/java-core</url>`. There is
  no Gradle `.module` file (it returns 404).
- `unzip -l launchdarkly-java-server-sdk-7.17.2.jar` (8,353,295 bytes): 427 classes are under
  `com/launchdarkly/sdk/` (the common types, for example `LDContext.class`, `LDValue.class`,
  `EvaluationDetail.class`, `EvaluationReason.class`, `LDUser.class`), 31 under
  `com/launchdarkly/logging/`, and 4,574 under `com/launchdarkly/shaded/`. The jar also contains
  `META-INF/maven/{com.google.code.gson,com.google.guava,org.yaml,commons-codec,org.jetbrains,…}`.
  The **common types are bundled in the jar**, so they are not a transitive dependency. The
  manifest `Export-Package` includes `com.launchdarkly.sdk`, `com.launchdarkly.sdk.server` and
  `com.launchdarkly.sdk.server.interfaces`, all at `version="7.17.2"`.
- `-sources.jar` contains only `com/launchdarkly/sdk/server/**`. It has no sources for the
  bundled `com.launchdarkly.sdk.*` common types, so the facts below about those types come from
  `javap`.
- The jar has no `META-INF/services/javax.annotation.processing.Processor`, so it brings no
  annotation processors.

## 2. Minimum Java version

- Command: `javap -v -cp <jar> com.launchdarkly.sdk.server.LDClient` (and `LDClientInterface`,
  `LDContext`, `EvaluationDetail`). Result: `major version: 52` (Java 8).
- A scan of every class file in the jar (Python reading bytes 6–7) gives: `sdk` 427 at 52,
  `logging` 31 at 52, `shaded` 4,492 at 52 / 15 at 51 / 67 at 49, and
  `META-INF/versions/9/…/snakeyaml/internal/Logger*.class` 2 at 53. Nothing needs more than Java 8
  (the multi-release snakeyaml classes are for 9+).
- The manifest has no `Multi-Release` or Java-version entry, and the published artifacts include no
  README. The README's statement of supported versions could not be read (github.com is not
  reachable from here). See "Not confirmed".

## 3. Client type

From `-sources.jar` `com/launchdarkly/sdk/server/interfaces/LDClientInterface.java`:

- Line 26: `public interface LDClientInterface extends Closeable {` (`java.io.Closeable`).
  `javap` agrees: `public interface com.launchdarkly.sdk.server.interfaces.LDClientInterface extends java.io.Closeable`.
- Lines 18–24 (javadoc): "This interface defines the public methods of {@link LDClient}. … being
  able to refer to it indirectly via an interface may be helpful in test scenarios (mocking) or for
  some dependency injection frameworks."
- `com/launchdarkly/sdk/server/LDClient.java` line 53: `public final class LDClient implements LDClientInterface {`.
- There is no narrower public interface. The only other candidate in the jar is
  `com.launchdarkly.sdk.server.EvaluatorInterface`, which is `ACC_PUBLIC` but internal. Its single
  method `evalAndFlag(...)` returns the package-private `EvalResultAndFlag` (`javap` shows
  `class com.launchdarkly.sdk.server.EvalResultAndFlag`, with no `public`), and it is not in the
  `interfaces` package. Unlike Go there is no `LDClientEvaluations`. Accepting `LDClientInterface`
  is correct, and a mock has to implement the whole interface (28 abstract methods plus `close`).

## 4. Typed method signatures

`LDClientInterface.java` (7.17.2 sources). Each method carries `@since 6.0.0`:

```java
boolean boolVariation(String key, LDContext context, boolean defaultValue);            // l.152
int intVariation(String key, LDContext context, int defaultValue);                    // l.171
double doubleVariation(String key, LDContext context, double defaultValue);           // l.187
String stringVariation(String key, LDContext context, String defaultValue);           // l.203
LDValue jsonValueVariation(String key, LDContext context, LDValue defaultValue);      // l.217
EvaluationDetail<Boolean> boolVariationDetail(String key, LDContext context, boolean defaultValue);   // l.234
EvaluationDetail<Integer> intVariationDetail(String key, LDContext context, int defaultValue);        // l.251
EvaluationDetail<Double> doubleVariationDetail(String key, LDContext context, double defaultValue);   // l.268
EvaluationDetail<String> stringVariationDetail(String key, LDContext context, String defaultValue);   // l.285
EvaluationDetail<LDValue> jsonValueVariationDetail(String key, LDContext context, LDValue defaultValue); // l.302
```

The imports are `com.launchdarkly.sdk.{EvaluationDetail,LDContext,LDValue}`, which matches the
earlier research and DESIGN.md.

- **Deprecated or legacy methods:** none in 7.17.2. Running `grep -i 'LDUser|jsonVariation|Ctx'`
  on the `javap` output of the interface finds nothing, and `grep -i deprecat` on the source finds
  nothing. `LDUser.class` still ships in `com/launchdarkly/sdk/`, but no evaluation method takes it.
  The wrapper only needs to call the 10 methods above.
- `intVariation` javadoc (l.156–157): a non-integer numeric value "is rounded toward zero
  (truncated)". The type is a 32-bit `int` (see the prototype finding about `big-quota`).
- **Nullability:** `javap -v` of the interface shows no `Runtime(In)VisibleParameterAnnotations`,
  so there are no `@Nullable` or `@NonNull` annotations. The javadoc of the variation methods says
  nothing about null. Empirically, with an offline `LDClient` (`$T/nulls/NullCheck.java`):
  - `stringVariation("k", ctx, null)` returns Java `null`.
  - `jsonValueVariation("k", ctx, null)` returns `LDValue` of type `NULL`, never a Java null.
    The implementation calls `LDValue.normalize(defaultValue)` (`LDClient.java` l.368).
  - `stringVariationDetail("k", ctx, null).getValue()` returns `null` with `idx=-1`,
    `reason=ERROR(CLIENT_NOT_READY)`, `isDefault=true`.

  So `String` results can be null when the caller passes a null fallback. `LDValue` results are
  never Java null.

## 5. Context propagation and the context type

- The interface has no `...Ctx` methods and no parameter for a request-scoped context or
  cancellation. The full list of declarations in `LDClientInterface.java` is `isInitialized`,
  `track`, `trackData`, `trackMetric`, `trackMigration`, `identify`, `allFlagsState`, the 10
  variation methods, `migrationVariation`, `isFlagKnown`, `close`, `flush`, `isOffline`,
  `getFlagTracker`, `getBigSegmentStoreStatusProvider`, `getDataSourceStatusProvider`,
  `getDataStoreStatusProvider`, `getLogger`, `secureModeHash` and `version`.
  **The Java target has no `Ctx` variant.** DESIGN.md's naming text names "flag methods, their
  `Detail` and `Ctx` variants". For Java that means only `Detail`.
- Context type: `public final class com.launchdarkly.sdk.LDContext implements com.launchdarkly.sdk.json.JsonSerializable`
  (`javap`). The factories are `create(String)`, `create(ContextKind, String)`,
  `createMulti(LDContext...)` and `builder(...)`.

## 6. `EvaluationDetail<T>`

`javap -constants -cp <jar> com.launchdarkly.sdk.EvaluationDetail`:

```
public final class com.launchdarkly.sdk.EvaluationDetail<T> implements com.launchdarkly.sdk.json.JsonSerializable {
  public static final int NO_VARIATION = -1;
  public static <T> EvaluationDetail<T> fromValue(T, int, EvaluationReason);
  public static EvaluationDetail<LDValue> error(EvaluationReason$ErrorKind, LDValue);
  public EvaluationReason getReason();
  public int getVariationIndex();
  public T getValue();
  public boolean isDefaultValue();
  equals / hashCode / toString
}
```

`getVariationIndex()` returns a primitive `int`. "No variation" is `-1` (`NO_VARIATION`), not
null, which differs from Go's `OptionalInt`. `EvaluationReason` is `com.launchdarkly.sdk.EvaluationReason`.

## 7. Javadoc syntax, escaping, doclint

Sources: the JDK 21 doc comment spec
(`ORA/en/java/javase/21/docs/specs/javadoc/doc-comment-spec.html`, titled "Documentation Comment
Specification for the Standard Doclet (JDK 21)"), the JDK 21 `javadoc` man page
(`ORA/en/java/javase/21/docs/specs/man/javadoc.html`, "DocLint" section), the JDK 21 `javac` man
page (`ORA/en/java/javase/21/docs/specs/man/javac.html`, `-Xdoclint`), and JLS 21 §3.3 and §3.7.

**Syntax.** A comment is `/** … */` directly before the declaration. Leading `*` characters are
discarded. It has a main description followed by block tags, and the main description "cannot
continue after any block tags". Block tags "must appear at the beginning of a line". Inline tags
take the form `{@tag …}` (spec: "Main Description", "Block Tags", "Inline Tags"). Content is HTML:
"HTML constructs should be written in HTML 5". Member headings start at `<h4>` and type headings at
`<h2>`.

**Escaping.** Spec quote: "If you want to start a line with the @ character and not have it be
interpreted, then use the HTML entity &#064;". "When the text content is HTML, it may be possible to
use entities &lbrace; and &rbrace; to represent unbalanced braces". The `{@link}` section says
"use the HTML entity notation &#125;". The JDK 21 spec adds escape sequences `@@`, `@/` (as in
`*@/`) and `@*`. These are **new in JDK 21**: the JDK 17 and JDK 20 specs have no "Escape
Sequences" section (`grep -c 'Escape Sequences'` gives 0 on both). So the generator should use
entities, which work with every javadoc version.

Empirical results with JDK 21 `javac --release 21 -Xlint:all -Xdoclint:all -Werror` and
`javadoc -Xdoclint:all [-private] -Werror` on one-member classes in `$T/doclint/*/p/T.java`:

| Input in comment | javac `-Xdoclint:all` | `javadoc -Xdoclint:all` |
| --- | --- | --- |
| `Salt & pepper` | **error: bad HTML entity** | error |
| `&foo;` (unknown entity) | **error: invalid entity &foo;** | error |
| `a < b`, `List<String>` | **error: malformed HTML**, **unknown tag: String** | error |
| `a > b` | ok | ok |
| `<a href="…?a=1&b=2">` (raw `&` in URL) | ok | ok |
| `&amp; &lt; &gt; &#64; *&#47; &#123; &#125; &middot; ·` | ok | ok (renders literally; `*&#47;` shows as `*/`) |
| `\` followed by `u` and non-hex (e.g. `C:\users`) | **error: illegal unicode escape** (lexer, JLS §3.3) | — |
| `@someone` at line start | ok (javac does not report unknown tags) | **error: unknown tag: someone** |
| `@maintainer ada` block tag | ok | **error: unknown tag: maintainer** |
| `{@foo}` in text | ok | **error: unknown tag: foo** |
| `ada@example.com` / `@team` mid-line | ok | ok |
| `{@code a{b}` (unbalanced) | **error: unterminated inline tag** | error |
| `{@code a<b&c>d}` | ok | ok |
| `<br>` and `<br/>` | ok | ok |
| `<p>` directly before `@param` | **warning: empty `<p>` tag** | warning |
| `<p></p>` | **warning: empty `<p>` tag** | warning |
| `<p>Text.</p>` | ok | ok |
| `<h1>` in a method comment | **error: unexpected heading used: <H1>…** | error |
| `/** */` | warning: empty comment | warning |
| `/** @param x x */` (no description) | **warning: no main description** | warning |
| `{@link #nope}` | error: reference not found | error |

Required escaping, given what javac and the `javadoc` tool both check:

| Character | Escape | Why |
| --- | --- | --- |
| `&` | `&amp;` | doclint syntax error. A raw `&` in an `href` is accepted, but escaping it there is valid too. |
| `<` | `&lt;` | doclint syntax error |
| `>` | `&gt;` (optional) | accepted raw. Escape it anyway for symmetry. |
| `@` | `&#64;` (everywhere, or at least at line start) | at line start it becomes a block tag; `javadoc` reports an unknown-tag error |
| `{` (`}`) | `&#123;` (`&#125;`) | `{@…}` is an inline tag; `javadoc` reports an unknown-tag error |
| `*/` | `*&#47;` | ends the comment (JLS §3.7) |
| `\` | `&#92;` | Unicode escapes are processed in comments too (JLS §3.3). `\u` followed by non-hex digits is a compile error, and `\u002a\u002f` would end the comment. |

Text inside `{@code …}` cannot use entities: they render literally (spec: "Escape sequences cannot
be used in inline tags that contain literal text"). Use `{@code}` only for flag keys, which have no
braces, `@` or backslashes, and put other text in HTML-escaped plain text.

**doclint groups** (javadoc man page, "DocLint › Groups"):

- `accessibility`: for example `<img>` without `alt`, or `<table>` without a caption.
- `html`: high-level HTML problems, such as block elements inside inline ones or unclosed elements.
- `missing`: "a missing comment on a class declaration, or a missing @param or @return tag".
- `reference`: `@see` or `{@link}` targets not found, or a bad `@param` name.
- `syntax`: "unescaped angle brackets (< and >) and ampersands (&) and invalid documentation
  comment tags".

**What `javac -Xdoclint:all` checks.** The `javac` man page says: "The variable access specifies
the minimum visibility level … **The default access level is private.**" When DocLint runs from
`javac`, it "solely relies on the various -Xdoclint… options" (javadoc man page). Empirically
(`$T/doclint/A_private_uncommented`), an uncommented `private final int x;` gives
`warning: no comment` under `-Xdoclint:all` and under plain `-Xdoclint`. Under
`-Xdoclint:all/protected`, and in the `javadoc` tool (default access protected), it does not.
Other results:

- `@param` and `@return` are required (`warning: no @param for a`, `warning: no @return`).
- A class without an explicit constructor gives `warning: use of default constructor, which does
  not provide a comment`, so a `Keys` holder needs an explicit commented `private Keys() {}`. The
  prototype does this.
- An uncommented `private Keys() {}` gives `warning: no comment`.
- Missing comments are warnings, so `-Werror` makes them fatal.

## 8. Deprecation

- `java.lang.Deprecated` (`ORA/en/java/javase/21/docs/api/java.base/java/lang/Deprecated.html`)
  has "Since: 1.5". Its elements are `String since()` (default `""`, **Since: 9**) and
  `boolean forRemoval()` (default `false`, **Since: 9**). API note: "The @Deprecated annotation
  should always be present if the @deprecated javadoc tag is present, and vice-versa."
- Empirical (`$T/depsince`): `@Deprecated(since = "1")` under `--release 8` gives
  `error: cannot find symbol … method since()`. It compiles under `--release 9`. If the fixture or
  users target 8, emit a bare `@Deprecated`.
- `dep-ann` is defined as "Warns about the items marked as deprecated in JavaDoc but without the
  @Deprecated annotation" (`javac --help-lint`). Empirically:
  - Tag without annotation (`L2`): `warning: [dep-ann] deprecated item is not annotated with @Deprecated`.
  - Annotation without tag (`L1`): **no warning** from `javac -Xlint:all -Xdoclint:all` or from
    `javadoc -Xdoclint:all`. The generator has to enforce the pairing itself.
- Use in the same class (JLS 21 §9.6.4.6, `ORA/javase/specs/jls/se21/html/jls-9.html#jls-9.6.4.6`):
  no deprecation warning is produced when "The declaration where the use appears and the
  declaration of the ordinarily deprecated program element are both within the same outermost
  class". The same exception applies to removal warnings. Empirical (`L3`): a non-deprecated `h()`
  using `Keys.OLD` and a deprecated `f()` in the same top-level class gives no warning. Calling
  them from another package (`L4`) gives `[deprecation] f() in T has been deprecated`, and for
  `forRemoval = true` it gives `[removal] … marked for removal`.
- §9.6.4.6 also says a use inside a declaration that is itself deprecated does not warn for
  ordinary deprecation, but terminal deprecation (`forRemoval=true`) warns "even if the using
  element is itself deprecated". Another reason to keep `forRemoval` false.

## 9. JLS identifiers, keywords, Object methods

JLS for Java SE 21 (`ORA/javase/specs/jls/se21/html/jls-3.html`).

**§3.9 ReservedKeyword (51):**
`abstract assert boolean break byte case catch char class const continue default do double else
enum extends final finally float for goto if implements import instanceof int interface long native
new package private protected public return short static strictfp super switch synchronized this
throw throws transient try void volatile while _`

**§3.9 ContextualKeyword (17):**
`exports module non-sealed open opens permits provides record requires sealed to transitive uses
var when with yield`

**Literals (§3.8, §3.10.3, §3.10.8).** `true` and `false` "are not keywords, but rather boolean
literals". `null` "is not a keyword, but rather the null literal". Identifier is "IdentifierChars
but not a ReservedKeyword or BooleanLiteral or NullLiteral", so all three must be on the reject
list. Contextual keywords **are** legal identifiers, with these exceptions:

- `TypeIdentifier` excludes `permits, record, sealed, var, yield`. This matters only for class
  names. A per-tag class gets a `Flags` suffix, so the bare word never appears.
- `UnqualifiedMethodIdentifier` excludes `yield`. A method named `yield` can be declared, but every
  call to it must be qualified (`flags.yield(...)`). Generated code never calls flag methods
  unqualified, so this is legal. Rejecting it anyway is cheap.

**Identifier grammar (§3.8).** `IdentifierChars: JavaLetter {JavaLetterOrDigit}`, where a Java
letter is any character for which `Character.isJavaIdentifierStart(int)` is true. The "Java
letters" include ASCII `A-Z`, `a-z`, `$` and `_`. The "Java digits" include `0-9`. `$` "should be
used only in mechanically generated source code". `_` "may be used in identifiers formed of two or
more characters, but it cannot be used as a one-character identifier due to being a keyword".
**So `[A-Za-z_$][A-Za-z0-9_$]*` is a safe subset**, minus a lone `_`, the 51 reserved keywords and
`true`, `false` and `null`. The DESIGN converter drops every non-letter/digit and produces only
`[A-Za-z0-9]`, which stays inside that subset.

**Object methods** (`javap java.lang.Object`; JDK 21 API doc `java/lang/Object.html`):

| Method | Modifiers |
| --- | --- |
| `getClass()` | `public final native` |
| `hashCode()` | `public native` |
| `equals(Object)` | `public` |
| `clone()` | `protected native`, throws `CloneNotSupportedException` |
| `toString()` | `public` |
| `notify()`, `notifyAll()` | `public final native` |
| `wait()`, `wait(long)`, `wait(long, int)` | `public final` |
| `finalize()` | `protected`, `@Deprecated(since="9", forRemoval=true)` |

These nine names match DESIGN.md's list. With signature `(LDContext, T)`, a flag method can only
overload them, never override them. The prototype showed that this compiles silently, so the
generator has to reject these names itself.

## 10. google-java-format

- Version: `GJF/maven-metadata.xml` gives `<latest>1.37.0</latest>`, `<release>1.37.0</release>`,
  `<lastUpdated>20261001121859</lastUpdated>`.
- Runtime JDK: `google-java-format-1.37.0-all-deps.jar` has `MANIFEST.MF` `Java-Version: 21`,
  `Build-Jdk-Spec: 21`, and `javap -v com.google.googlejavaformat.java.Main` gives
  `major version: 65` (Java 21). **JDK 21 or newer is required.** The manifest has
  `Add-Exports: jdk.compiler/com.sun.tools.javac.{api,code,file,parser,tree,util}`, so `java -jar`
  needs no `--add-exports` flags. (Those flags are needed only when running from the classpath,
  not with `-jar`.)
- The command that worked on JDK 21.0.12:
  `java -jar google-java-format-1.37.0-all-deps.jar [--dry-run] [--set-exit-if-changed] FILES`.
  `--dry-run`/`-n` "Prints the paths of the files whose contents would change".
  `--set-exit-if-changed` "Return exit code 1 if there are any formatting changes". `-i` rewrites
  files in place. Other options: `--skip-javadoc-formatting`, `--skip-sorting-imports`,
  `--skip-removing-unused-imports`, `--skip-reflowing-long-strings`,
  `--skip-reordering-modifiers`, `--aosp`, `--max-line-length` (default 100). Source: `--help`.
- No README ships in the jar or the POM. Style rules are cited from the Google Java Style Guide
  (`https://google.github.io/styleguide/javaguide.html`) and from empirical runs (`$T/gjf/In.java`):
  - Indentation is +2 spaces (§4.2) and the column limit is 100 (§4.4). The guide exempts "a long
    URL in Javadoc", but the formatter still rewraps text around it (below).
  - Imports (§3.3.3) form one static group, a blank line, then one non-static group, each in ASCII
    order. Unused imports are removed. Empirically, `com.launchdarkly.sdk.LDValue` sorts before
    `com.launchdarkly.sdk.server.interfaces.LDClientInterface` (`L` < `s`).
  - Blank lines (§4.6.1) go between consecutive members. Between two fields they are optional.
    Empirically, gjf keeps adjacent undocumented fields adjacent but **inserts a blank line before
    any field that has a javadoc comment**.
  - Annotations: a method annotation always goes on its own line. `@Deprecated public boolean m()`
    becomes `@Deprecated\n  public boolean m()`, although the guide (§4.8.5.3) would allow the
    one-line form. A field annotation goes **on the same line**: `@Deprecated\n public static final
    String K2` becomes `@Deprecated public static final String K2` (§4.8.5.4 allows this).
  - An empty constructor body `private Keys() {\n}` becomes `private Keys() {}`. A one-line
    constructor body `{ this.client = client; }` is expanded to multiple lines.
  - A long method signature wraps after `(` with a +4 continuation indent.
  - Modifiers are reordered into JLS order (`final public static` becomes `public static final`).
  - Javadoc **is reformatted**. Text is rewrapped at 100 columns, a blank ` *` line is inserted
    before `<p>` and before the block-tag group, `<p>` is joined to the following text, and lines
    in one paragraph are joined. A long `<a href="…">Open in LaunchDarkly</a>` gets split, either
    between `Open` and `in` or as `<a` on one line and `href=…` on the next. gjf never breaks a
    line in front of a word that starts with `@`. Empirically, for 17–21 filler words it always
    moved the preceding word down instead. `--skip-javadoc-formatting` turns all of this off.
- **Diff on the prototype's `CheckoutFlags.java`** (`java -jar … CheckoutFlags.java | diff CheckoutFlags.java -`):

  ```
  29c29,30   <a href=".../flags/checkout">Open in LaunchDarkly</a>          -> wrapped: "...">Open in\n * LaunchDarkly</a>
  42,43c43,44 PROTOTYPE paragraph                                           -> rewrapped at 100 cols
  57c58,59   <a href=".../flags/checkout-detail">Open in LaunchDarkly</a>   -> wrapped
  84c86,87   <a href=".../flags/old-banner">Open in LaunchDarkly</a>        -> wrapped
  115a119    + blank line before "/** {@code checkout-detail} */"
  117a122    + blank line before the deprecated OLD_BANNER javadoc
  ```

  `@Deprecated public static final String OLD_BANNER` stays on one line, and `private Keys() {}`
  is unchanged. With `--skip-javadoc-formatting`, only the two blank-line insertions (115a116,
  117a119) remain. `--dry-run --set-exit-if-changed` on all four prototype files lists all four
  files and exits with 1. `BillingFlags.java` also has its imports re-sorted (it lists
  `…server.interfaces.LDClientInterface` before `…sdk.LDValue`). After `-i`, a second run is
  clean (exit 0), and the formatted files still compile with
  `--release 11 -Xlint:all -Xdoclint:all -Werror`, so gjf's javadoc rewrap keeps doclint happy.

## 11. Strictest compile settings

`javac --help-lint` (JDK 21.0.12) lists these keys. The ones relevant here:

- `processing`: "Warn about issues regarding annotation processing". The SDK jar has no processors
  (no `META-INF/services`). Empirically, the prototype compiles cleanly with plain `-Xlint:all`, so
  the `-processing` in the prototype POM is harmless but unnecessary.
- `options`: "Warn about issues relating to use of command line options". Empirically:
  - `--release 8` gives `warning: [options] source value 8 is obsolete and will be removed in a
    future release` (and the same for target), which fails `-Werror`.
  - `-source 8 -target 8` without `--release` also gives `[options] bootstrap class path not set
    in conjunction with -source 8`.
  - `--release 8 -Xlint:all,-options -Xdoclint:all -Werror` compiles the whole prototype, including
    `Consumer.java`.
  - `--release 9`, `11`, `17` and `21` give no `options` warning.
  - The `javac` man page says `--release` cannot be combined with `-source`/`-target`.
    `javac --help` lists supported releases "8, 9, … 21".
- `serial`: does not apply. The generated classes are not `Serializable`.
- `this-escape`: "Warn when a constructor invokes a method that could be overriden in an external
  subclass". Empirically (`$T/lint`):
  - A `public final class` whose constructor assigns `this.client = client` gives **no warning**.
  - A non-final public class with the same constructor gives no warning either.
  - A non-final class whose constructor calls a public non-final `init()` gives
    `warning: [this-escape] possible 'this' escape before subclass is fully initialized`. This is
    reported even with `--release 11`, because the lint belongs to the compiler, not to the target.
  - The generated `public final class` with a field-assigning constructor is safe.
- `dep-ann`, `deprecation` and `removal`: see §8.
- `missing-explicit-ctor`: applies only to "public and protected classes in exported packages",
  that is, to named modules. It is not triggered in the unnamed module.
- **Fixture `--release`:** the SDK's floor is Java 8 (class major 52), but `--release 8` cannot
  pass `-Xlint:all -Werror` on JDK 21 without `-Xlint:-options`. **`--release 11`** (the prototype's
  choice) is the lowest setting that is clean under the full `-Xlint:all -Xdoclint:all -Werror`
  and works with `@Deprecated(since=…)`. If the fixture should prove Java 8 source compatibility,
  use `--release 8 -Xlint:all,-options -Xdoclint:all -Werror` and emit bare `@Deprecated`.
  Empirically, the prototype passes at `--release 8` (with `-options`), 11 and 21.

## 12. SDK 6.x

- `SDK/6.3.0/launchdarkly-java-server-sdk-6.3.0-sources.jar`, `LDClientInterface.java`
  l.236–557: the same ten typed `(String key, LDContext context, T defaultValue)` methods with the
  same return types as 7.17.2, plus `LDUser` overloads that the wrapper never calls. 6.3.0 is the
  last 6.x.
- Empirical: the single-class prototype (`origin/prototype/java-emitter`,
  `prototypes/java-emitter`) compiles clean against 6.3.0 and 7.17.2, each at `--release 8`
  (with `-Xlint:all,-options`) and `--release 11`, under `-Xdoclint:all -Werror`.

## Corrections to DESIGN.md

1. **Javadoc escaping is incomplete** ("### Doc comments" → Java). Add `@` → `&#64;` and `{` →
   `&#123;` (`}` → `&#125;`). Both produce `javadoc` errors (unknown tag) that `javac -Xdoclint`
   does **not** report, so the `-Xdoclint:all -Werror` gate alone would not catch them. Also add
   `\` → `&#92;`: `\u` in any comment is a lexical compile error (JLS §3.3), and `\u002a\u002f`
   ends the comment. Escaping `>` is not required (accepted raw) but harmless.
2. **The `Ctx` variants do not apply to Java.** "### Naming" (Collision) and "### Deprecation" say
   the annotation goes on the "`Detail` and `Ctx` variants". The Java SDK has no context-propagation
   methods, so Java emits only the base and `Detail` methods.
3. **The Java reserved-word list must include the literals.** "The JLS list" should be stated
   explicitly as the 51 reserved keywords (including `_`) plus `true`, `false` and `null`, which are
   literals rather than keywords but are still not identifiers. Optionally add `yield` (it cannot
   be invoked unqualified).
4. **Deprecation pairing has to be enforced by the generator.** javac and javadoc both stay silent
   for `@Deprecated` without `@deprecated`. Use a bare `@Deprecated`, because `since`/`forRemoval`
   need Java 9 and `forRemoval=true` warns even inside deprecated callers.
5. **Doclint details the sketch should state:**
   - The constructor comment needs a main description, not just `@param`, or doclint warns "no
     main description".
   - `Keys` needs an explicit commented private constructor.
   - Never emit an empty `<p>` or a `<p>` directly before the block tags.
6. **The sketch is not google-java-format output.**
   - The one-line constructor body `{ this.client = client; }` gets expanded.
   - Documented `Keys` constants get blank lines between them.
   - Javadoc lines longer than 100 columns (the `<a href>` trailer) get rewrapped.

   If the output must be gjf-stable, emit those forms directly, or document that the output is not
   gjf-formatted. gjf 1.37.0 itself needs JDK 21 to run.

Corrections to the prototype (`origin/prototype/go-java-crosscheck`):

- `BillingFlags.java` imports are not in ASCII order (`…server.interfaces.LDClientInterface` comes
  before `…sdk.LDValue`).
- The README says "a call to `oldBanner` raises the deprecation warning", but the committed
  `Consumer.java` never calls `oldBanner`, so the committed code does not exercise that claim. The
  behaviour itself is confirmed by `$T/doclint/L4` (cross-package `[deprecation]`), and by
  JLS §9.6.4.6 for same-class uses not warning.
- `-Xlint:all,-processing` can be plain `-Xlint:all`.

Corrections to `research/sdk-apis.md`:

- The majors on Maven Central include 4.x as well as 5, 6 and 7.
- "Common types are bundled" is now confirmed by listing the jar (§1).

## Not confirmed from a primary source

- **The SDK README's stated minimum Java version.** It is not in the published artifacts, and
  github.com is unreachable. The Java 8 floor comes from class-file versions only.
- **Javadoc for the bundled common types** (`LDValue`, `EvaluationDetail`, `LDContext`). The
  server `-sources.jar` does not include them. Their signatures come from `javap`. The behaviour
  of null and default values is empirical (§4), not documented.
- **The google-java-format README** (not shipped in the jar; GitHub unreachable). The formatting
  rules come from the Google Java Style Guide and empirical runs. The rule that gjf never breaks
  before a word starting with `@` was only observed (§10), not documented.
- **Which gjf version is the last one to run on JDK 17.** Not checked; only 1.37.0 was downloaded.
