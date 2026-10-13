---
layout: home
hero:
  name: launchtarqly-codegen
  text: Typed LaunchDarkly flags
  tagline: Reads your project's flags from LaunchDarkly and writes a thin, type-safe wrapper around the official SDK, for every language your repo uses.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: CLI reference
      link: /reference/cli
features:
  - title: Keys and types at compile time
    details: One method per flag with the flag's value type. A typo in a key or a string passed where a boolean belongs fails the build, not production.
  - title: One config, many targets
    details: TypeScript (Node server SDK), Go, Java and .NET from a single run. A monorepo gets output for every language it uses.
  - title: Stays out of the evaluation path
    details: The wrapper only calls the SDK. No caching, no network, no baked-in defaults, no runtime package to install.
  - title: Safe in CI
    details: "`check` regenerates in memory and fails when committed output drifts from LaunchDarkly, with a diff and a summary of which flags changed."
---
