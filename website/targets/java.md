# java

For the Java server SDK, `com.launchdarkly:launchdarkly-java-server-sdk` 7.x.

```yaml
targets:
  - id: java
    out: src/main/java/com/example/flags/   # a directory; Flags.java is written in it
    package: com.example.flags              # required
    sdkMajor: 7
```

## Usage

```java
Flags flags = new Flags(new LDClient(sdkKey));

boolean enabled = flags.checkoutV2(context, false);
EvaluationDetail<Boolean> detail = flags.checkoutV2Detail(context, false);
String key = Flags.Keys.CHECKOUT_V2; // "checkout-v2"
```

`Flags` takes an `LDClientInterface`. Methods are lowerCamel and key
constants CONSTANT_CASE in `Flags.Keys`. JSON flags return `LDValue`.
Deprecated flags get `@Deprecated` and a `@deprecated` Javadoc tag. Output
targets Java 8 and is google-java-format canonical.

## Generated output

<<< ../../fixtures/golden/java/flag-kinds.java
