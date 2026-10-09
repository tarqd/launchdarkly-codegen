# Client-side availability on older projects

Research for issue #8 (DESIGN.md open question 4). Researched 2026-10-09.

## Question

Is a flag's client-side availability always project-level and always populated
in the flags API, including for projects and flags created before the
project-level setting existed?

- `clientSideAvailability` vs. the legacy `includeInSnippet` field: which is
  authoritative, and can either be absent?
- Can availability differ per environment anywhere in the current API?

## Short answer

- **Availability is a flag-level setting, not a project-level one.** It sits on
  the flag's global attributes and applies to every environment. The project
  holds only a *default* (`defaultClientSideAvailability`, legacy
  `includeInSnippetByDefault`) that is copied onto *new* flags when they are
  created. DESIGN.md's wording ("project level") is wrong, but its conclusion
  holds: the browser target can filter without reading environment state.
- **`clientSideAvailability` is authoritative.** `includeInSnippet` is
  deprecated and maps only to `clientSideAvailability.usingEnvironmentId`.
- **In practice, `clientSideAvailability` is always in flag responses.** When a
  stored flag has no `clientSideAvailability` (flags from before the field
  existed), the API server builds one from `includeInSnippet`, with
  `usingMobileKey: true`. The published OpenAPI schema still marks the field
  and both sub-fields as optional, so the generator should code a fallback.
- **No per-environment availability exists in the current API.** The
  per-environment flag config schema has no availability field, and the
  semantic-patch instructions that change availability are in the group that
  applies "across all environments".

## Findings

### 1. Availability is per flag and applies to all environments

- The OpenAPI `FeatureFlag` schema (the flag's global attributes) carries
  `clientSideAvailability` (`$ref: ClientSideAvailability`, with
  `usingMobileKey` and `usingEnvironmentId`) and the deprecated
  `includeInSnippet`. [OpenAPI spec][spec], `components.schemas.FeatureFlag`.
- The per-environment schema `FeatureFlagConfig` (the values in
  `environments.{envKey}`) has these properties: `on, archived, salt, sel,
  lastModified, version, targets, contextTargets, rules, fallthrough,
  offVariation, prerequisites, _site, _access, _environmentName, trackEvents,
  trackEventsFallthrough, _debugEventsUntilDate, _summary, evaluation,
  migrationSettings`. None of them is about availability. [OpenAPI
  spec][spec], `components.schemas.FeatureFlagConfig`.
- The `Environment` schema has no availability field either. [OpenAPI
  spec][spec], `components.schemas.Environment`.
- The "Update feature flag" (PATCH) docs put `turnOnClientSideAvailability` and
  `turnOffClientSideAvailability` under "updating flag settings", which the docs
  describe like this: "These instructions do not require the `environmentKey`
  parameter. They make changes that apply to the flag across all
  environments." By contrast, the targeting and on/off groups say "These
  instructions require the `environmentKey` parameter." [OpenAPI spec][spec],
  `paths./api/v2/flags/{projectKey}/{featureFlagKey}.patch.description`.
- The product docs say the same. Flags are made available "in the flag's right
  sidebar" ("Advanced controls"), and "You can update your project settings so
  that all new flags are automatically available to client-side or mobile
  SDKs." The client-side ID "grants these SDKs access to evaluate any flags that
  are associated with the key's environment, and that you have enabled for
  client-side SDK availability". This gives access per environment, but the
  per-flag availability bit is shared by all environments. [Create flags][docs-new],
  [Client-side, server-side, and edge SDKs][docs-sdk].
- The list-flags endpoint takes the filter `sdkAvailability` with the values
  `client`, `mobile`, `anyClient` and `server`, and it does so without needing
  `env`. [OpenAPI spec][spec], `getFeatureFlags` description.

### 2. Project-level settings are defaults for new flags only

- `Project.defaultClientSideAvailability` is described as "Describes which
  client-side SDKs can use new flags by default". The legacy
  `Project.includeInSnippetByDefault` is described as "Whether or not flags
  created in this project are made available to the client-side JavaScript SDK
  by default". The same default also appears in the flag-defaults resource
  (`/api/v2/projects/{projectKey}/flag-defaults`, schema
  `UpsertFlagDefaultsPayload.defaultClientSideAvailability`). [OpenAPI
  spec][spec].
- So changing the project default does not change existing flags. A generator
  that read only the project setting would be wrong for any flag whose
  availability was set on its own. The generator must read the flag's own
  field.
- Product docs: "LaunchDarkly accounts created after October 21, 2025 have this
  box checked by default." This is about the project default for new flags, not
  a backfill. [Create flags][docs-new].

### 3. `clientSideAvailability` is authoritative; `includeInSnippet` is a deprecated alias

- OpenAPI: `includeInSnippet` is `deprecated: true`, "Deprecated, use
  `clientSideAvailability`." [OpenAPI spec][spec], `FeatureFlag.includeInSnippet`.
- `includeInSnippet` means only the client-side ID (JavaScript) channel, that
  is, `usingEnvironmentId`. Terraform's v3 migration rewrites
  `include_in_snippet` to
  `client_side_availability[0].using_environment_id`.
  [terraform-provider-launchdarkly#440][tf440], [#439][tf439], [Terraform v2 to
  v3 migration guide][tf-mig].
- When creating a flag, the server rejects a body that sets both:
  `"availability cannot be set when includeInSnippet value is provided"`.
  [gonfalon `map_defaults_to_feature_flag.go`][gf-defaults] (internal).
- On update, the server keeps the two in sync. When `includeInSnippet` changes,
  `clientSideAvailability.usingEnvironmentId` is set to the same value, and a
  request that changes both at once to different values is rejected.
  [gonfalon `flags_patch.go`][gf-patch] (internal).
- Not confirmed: whether a change made only to
  `clientSideAvailability.usingEnvironmentId` (for example through
  `turnOnClientSideAvailability`) also rewrites the stored `includeInSnippet`.
  The public "Get feature flag" example response shows `"includeInSnippet":
  true` next to `"usingEnvironmentId": false` ([Get feature flag][docs-get]).
  That may just be a sloppy example, but it is a reason not to trust
  `includeInSnippet` when `clientSideAvailability` is present.

### 4. Can either field be absent?

What the public contract says:

- `FeatureFlag.required` lists `name, kind, key, _version, creationDate,
  variations, temporary, tags, _links, experiments, customProperties,
  archived`. Neither `clientSideAvailability` nor `includeInSnippet` is
  listed. Inside `ClientSideAvailability` (the response schema), neither
  sub-field is required. The request schema `ClientSideAvailabilityPost` does
  require both. [OpenAPI spec][spec].
- The official Go client generated from the spec has `ClientSideAvailability
  *ClientSideAvailability \`json:"clientSideAvailability,omitempty"\`` and
  pointer `*bool` sub-fields with `omitempty`. [api-client-go
  `model_feature_flag.go`][go-ff], [`model_client_side_availability.go`][go-csa].

What the server actually does, from LaunchDarkly's API server source (internal,
via Glean):

- The flag representation builder (`makeFlagGlobalAttributesRep` in
  [gonfalon `internal/flags/reps/flag_rep.go`][gf-rep]) always emits
  `clientSideAvailability`. When the stored flag has none, it builds one:

  ```go
  if f.ClientSideAvailability == nil {
      clientSideAvailability = &flag_models.ClientSideAvailability{
          UsingEnvironmentId: f.IncludeInSnippet,
          UsingMobileKey:     true, // by default mobile key can see everything to preserve legacy behavior
      }
  }
  ```

  `IncludeInSnippet` is a plain `bool` (not a pointer, no `omitempty`) in that
  rep, so it is always serialized. The stored model's `ClientSideAvailability`
  struct uses non-pointer `bool` fields with no `omitempty`
  ([gonfalon `flag_global_attributes.go`][gf-model]), so when the object is
  present, both sub-fields are present.
- The PATCH path has the same fallback ("pretend this was already set to the
  default value"). [gonfalon `flags_patch.go`][gf-patch].
- An integration test creates a project with only the legacy
  `defaultIncludeInSnippet: false` and checks that a new flag's response has
  `clientSideAvailability` with `usingMobileKey: true, usingEnvironmentId:
  false` (`require.NotEmpty(... "/clientSideAvailability")`). [gonfalon
  `client_side_availability_integration_test.go`][gf-test].

So for a pre-`clientSideAvailability` flag, the API returns
`usingEnvironmentId = includeInSnippet` and `usingMobileKey = true`. That
matches the legacy behavior, where the mobile key could evaluate every flag.

Caveat: the source was read through Glean snippets. I read the relevant parts
of `flag_rep.go` and `flags_patch.go`, not every line, and did not check every
other code path that might serialize flags (for example older API versions).
Only the flag-rep builder was confirmed.

## Implications for the generator

1. Filter ts-browser on `flag.clientSideAvailability.usingEnvironmentId`, read
   from each flag in `GET /api/v2/flags/{projectKey}`. Do not read the project
   default. No `env` parameter is needed. This confirms the DESIGN.md decision
   and corrects its reasoning.
2. Normalize defensively, because the published schema allows the field to be
   absent:
   - `usingEnvironmentId = clientSideAvailability?.usingEnvironmentId ??
     includeInSnippet ?? false`
   - `usingMobileKey = clientSideAvailability?.usingMobileKey ?? true` (this
     matches the server's legacy default)
   - If both fields are absent, which should not happen against the live API,
     print a warning, because it most likely means a hand-edited snapshot.
3. Optional: pass `filter=sdkAvailability:client` for the browser target, and
   re-check locally as DESIGN.md already does for tags. Because one fetch feeds
   every target, the simpler approach is to fetch everything once and filter
   in the normalizer or emitter.
4. Mobile targets (none in v1) would use `usingMobileKey` the same way.

## Contradictions with DESIGN.md

- Open question 4 and the browser-output reasoning say "Client-side
  availability is project level in the current API". It is **flag level**,
  applied to all environments of the project. The project setting is only the
  default for new flags. The design decision (filter without environment
  state) is still correct.
- In the `FlagModel`, `clientSideAvailability` is a required object with two
  required booleans. That is fine for the IR, but the fetcher or normalizer has
  to fill it in, because the OpenAPI response schema marks it optional (see
  implication 2).

## Not confirmed from a public primary source

- That `clientSideAvailability` is *always* present. This rests on
  LaunchDarkly's internal API server source, not the public contract. The
  public OpenAPI spec and generated clients treat it as optional.
- Whether `includeInSnippet` is rewritten when only `clientSideAvailability`
  changes.

## Sources

Public, primary:

- [spec]: LaunchDarkly REST API OpenAPI spec, `https://app.launchdarkly.com/api/v2/openapi.json` (fetched 2026-10-09, `info.version` 2.0)
- [docs-new]: Creating new flags, https://launchdarkly.com/docs/home/flags/new
- [docs-sdk]: Client-side, server-side, and edge SDKs, https://launchdarkly.com/docs/sdk/concepts/client-side-server-side
- [docs-get]: Get feature flag (API reference), https://launchdarkly.com/docs/api/feature-flags/get-feature-flag
- [go-ff]: https://github.com/launchdarkly/api-client-go/blob/main/model_feature_flag.go
- [go-csa]: https://github.com/launchdarkly/api-client-go/blob/main/model_client_side_availability.go
- [tf439]: https://github.com/launchdarkly/terraform-provider-launchdarkly/pull/439
- [tf440]: https://github.com/launchdarkly/terraform-provider-launchdarkly/pull/440
- [tf-mig]: https://launchdarkly.com/docs/integrations/terraform/migration-2-to-3

Internal (LaunchDarkly API server source, via Glean):

- [gf-rep]: https://github.com/launchdarkly/gonfalon/blob/main/internal/flags/reps/flag_rep.go
- [gf-patch]: https://github.com/launchdarkly/gonfalon/blob/main/internal/flags/api/flags/flags_patch.go
- [gf-defaults]: https://github.com/launchdarkly/gonfalon/blob/main/internal/flags/service/commands/create_feature_flag/map_defaults_to_feature_flag.go
- [gf-model]: https://github.com/launchdarkly/gonfalon/blob/main/internal/flags/models/flag_global_attributes.go
- [gf-test]: https://github.com/launchdarkly/gonfalon/blob/main/internal/flagdel/integration_tests/client_side_availability/client_side_availability_integration_test.go

[spec]: https://app.launchdarkly.com/api/v2/openapi.json
[docs-new]: https://launchdarkly.com/docs/home/flags/new
[docs-sdk]: https://launchdarkly.com/docs/sdk/concepts/client-side-server-side
[docs-get]: https://launchdarkly.com/docs/api/feature-flags/get-feature-flag
[go-ff]: https://github.com/launchdarkly/api-client-go/blob/main/model_feature_flag.go
[go-csa]: https://github.com/launchdarkly/api-client-go/blob/main/model_client_side_availability.go
[tf439]: https://github.com/launchdarkly/terraform-provider-launchdarkly/pull/439
[tf440]: https://github.com/launchdarkly/terraform-provider-launchdarkly/pull/440
[tf-mig]: https://launchdarkly.com/docs/integrations/terraform/migration-2-to-3
[gf-rep]: https://github.com/launchdarkly/gonfalon/blob/main/internal/flags/reps/flag_rep.go
[gf-patch]: https://github.com/launchdarkly/gonfalon/blob/main/internal/flags/api/flags/flags_patch.go
[gf-defaults]: https://github.com/launchdarkly/gonfalon/blob/main/internal/flags/service/commands/create_feature_flag/map_defaults_to_feature_flag.go
[gf-model]: https://github.com/launchdarkly/gonfalon/blob/main/internal/flags/models/flag_global_attributes.go
[gf-test]: https://github.com/launchdarkly/gonfalon/blob/main/internal/flagdel/integration_tests/client_side_availability/client_side_availability_integration_test.go
