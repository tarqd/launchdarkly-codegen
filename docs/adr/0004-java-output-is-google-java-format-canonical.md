# Java output is google-java-format 1.37.0's canonical form

Emitters write already-formatted text and no formatter runs (DESIGN.md →
Emitters). For Java the obvious formatter is google-java-format, and it does
more than indent: it re-fills every Javadoc paragraph to 100 columns, adds
hanging indents to block tags, collapses short comments to one line and breaks
long declarations. So the Java emitter reproduces those rules itself, as listed
in DESIGN.md → java, and the compile test runs
`google-java-format --dry-run --set-exit-if-changed` on every golden file to
prove the two agree.

We rejected promising only "compiles cleanly", because consumers who format
their sources with google-java-format would then see `check` report every
generated file as stale. We also rejected avoiding the reflow by emitting each
description line as its own paragraph or inside `<pre>`, because that changes
how the documentation renders and still leaves the declaration breaks.

This is recorded because it ties the output to one formatter version. If a
later google-java-format changes its layout, the emitter follows it and every
consumer's generated file changes once, the same as a generator upgrade.
Moving the pinned version is a deliberate change, made together with the
golden files.

Decided while designing the java target (add-emitter steps 2 and 3).
