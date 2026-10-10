# PROTOTYPE: single-class java target

Throwaway. Answers "does a single generated Java `Flags` class compile cleanly against
launchdarkly-java-server-sdk 7.x under the strictest settings, and does google-java-format leave
it unchanged?" (add-emitter step 2 for `java`). `Flags.java` is hand-written output for six flags:
boolean, string, number (double), number (int), json, and a deprecated boolean whose description
and message carry `&`, `<`, `>`, `*/`, a leading `@` and `{@`.

## Run

```sh
mvn -q compile        # java-server-sdk 7.17.2, --release 11, -Xlint:all,-processing -Xdoclint:all -Werror
java -jar google-java-format-1.37.0-all-deps.jar --dry-run src/main/java/com/example/**/*.java   # prints nothing
javadoc -Xdoclint:all -Werror -d /tmp/jd -cp "$(mvn -q dependency:build-classpath -Dmdep.outputFile=/dev/stdout)" src/main/java/com/example/flags/Flags.java
```

## Verdict

1. **Compiles clean.** Zero warnings under `-Xlint:all -Xdoclint:all -Werror` (and `javadoc
   -Xdoclint:all -Werror`). Removing a private member's comment or an `@return` fails the build,
   so the settings bite. The consumer runs against an offline client.
2. **Deprecation** warns at call sites of the method and of `Keys.LEGACY_CART`
   (`deprecated-use.java.txt`), and not inside `Flags` itself (same outermost class).
3. **google-java-format reflows Javadoc** (fills paragraphs to column 100, joins source lines)
   and breaks long declarations. The first hand-written draft was not canonical. Rules the
   emitter must reproduce, from `gjf-probes/`:
   - Javadoc text is greedy-filled to 100 columns, counting indent and ` * `. `<p>` starts a
     paragraph; `<br>` forces a break; a token longer than the line (a URL) sits alone and
     overflows. `{@code x}` may be split after `{@code`. gjf never starts a line with `@`.
   - Block-tag (`@param`, `@return`, `@deprecated`) continuation lines get 4 extra spaces.
   - A Javadoc that fits collapses to `/** text */`.
   - Over-long signature: break after `(`, parameters on one line at +4; one per line if that
     still doesn't fit. Same for the `return client.xVariation(...)` call.
   - Over-long constant: break after `=`, literal at +4.
   - Width is counted in UTF-16 units (non-ASCII text counts one per char).
