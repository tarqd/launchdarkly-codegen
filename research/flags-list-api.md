# Flags list API: response shape for codegen fields

Research for issue #6. Question: what does `GET /api/v2/flags/{projectKey}`
return for the fields the `FlagModel` needs, and how should the fetcher ask
for it?

Researched 2026-10-09. No `LD_API_TOKEN` was available, so **no sample
response was recorded**. Everything below comes from documentation and source
code, not from a live call.

## Sources

| Tag | Source | Trust |
| --- | --- | --- |
| [spec] | Official OpenAPI spec, `https://app.launchdarkly.com/api/v2/openapi.json` (fetched 2026-10-09). Operation `getFeatureFlags`; schemas `FeatureFlags`, `FeatureFlag`, `ClientSideAvailability`, `CustomProperties`, `customProperty`, `MemberSummary`, `MaintainerTeam`, `Variation` | primary |
| [api-overview] | REST API overview, https://launchdarkly.com/docs/api: "Representations", "Rate limiting" and "Versioning" sections (the same text is in the spec's `info.description`) | primary |
| [list-flags] | List feature flags reference, https://launchdarkly.com/docs/api/feature-flags/list-feature-flags | primary |
| [migration] | REST API migration guide 20220603 to 20240415, https://launchdarkly.com/docs/guides/api/api-migration-guide | primary |
| [deprecate] | Deprecating flags, https://launchdarkly.com/docs/home/flags/deprecate | primary |
| [custom-props] | Custom properties, https://launchdarkly.com/docs/home/infrastructure/custom-properties | primary |
| [gonfalon-cp] | LaunchDarkly API server source (internal), `internal/shared/custom_properties/custom_properties.go`, https://github.com/launchdarkly/gonfalon/blob/main/internal/shared/custom_properties/custom_properties.go | primary (internal, read through Glean) |
| [gonfalon-rep] | Same repo, `internal/flags/reps/flag_rep.go`, https://github.com/launchdarkly/gonfalon/blob/main/internal/flags/reps/flag_rep.go | primary (internal) |
| [gonfalon-filter] | Same repo, flag list SQL filter tests (`internal/flags/internal/flags/crdb/helpers_test.go`) and `internal/flags/api/flags/flags_get_test.go` | primary (internal) |

## 1. Pagination, page size, and leaving out environment data

**Always send `LD-API-Version: 20240415`.** If the header is missing, the
API version comes from the access token, and older tokens get older list
behaviour (in older versions the flag list was not paginated and included
environments). The docs recommend setting the header in every client
[api-overview §Versioning].

Pagination under 20240415:

- `limit` and `offset` query parameters. **Default page size 20, maximum
  `limit` 100** [migration §Changes to the feature flags API]. The spec
  only says "Defaults to 20" and does not give the maximum [spec].
- The response is `{ items: FeatureFlag[], _links, totalCount }`. `_links`
  holds `first`, `prev`, `next` and `last`, and a link is left out when its
  page does not exist (no `next` on the last page) [spec `getFeatureFlags`
  description, `FeatureFlags` schema].
- The documented stop conditions are an empty `items` array, or `offset`
  greater than `totalCount` [migration §Working with paginated endpoints].
  Following `_links.next` until it is missing gives the same result and does
  not hard-code the page size.
- Offset pagination does not give a consistent snapshot. If a flag is
  archived or created while the fetcher is paging, later offsets shift and a
  flag can be skipped or seen twice. This follows from offset pagination;
  LaunchDarkly support has confirmed it for this endpoint (internal ticket,
  not linked). Mitigations: sort by `key` (or `creationDate`), dedupe by key,
  and in `check` mode compare `totalCount` across the first and last pages
  and retry once if it changed.

Leaving out environment data:

- **Do not send `env`.** Under 20240415 the `environments` field "is now
  only included in the response if the request is filtered by environment,
  using the `env` query parameter" [migration]. Without `env`, nothing
  environment-scoped comes back. (The spec's field description says
  `filterEnv`; the migration guide and the parameter list say `env`. Either
  way, not sending it means no environments.)
- `summary` defaults to true. It only matters together with `env`
  (`summary=0&env=…` adds prerequisites, targets and rules) [spec `summary`
  parameter]. The fetcher can leave it unset.
- Do not send `expand`. Its values (`codeReferences`, `evaluation`,
  `migrationSettings`) are not needed [spec].
- **There is no field-selection parameter.** The endpoint has no `fields`
  or projection option, so the response always contains the whole summary
  representation of each flag (including `experiments`, `_links`, `defaults`
  and so on) [spec parameter list]. See the DESIGN notes below.

Default contents of the list (no `filter=state:`):

- Archived flags are **excluded**, deprecated flags are **included**, and
  AI Config flags (`purpose` `ai` or `ai_graph`) are excluded. The server
  builds `WHERE archived = false AND (NOT purpose IN ai, ai_graph …)` when
  there is no state filter, and its handler test expects deprecated flags in
  the default result [gonfalon-filter]. The spec's `archived` parameter
  agrees: "When this is absent, only unarchived flags will be returned"
  [spec].
- `filter=state:live|deprecated|archived` narrows the list further. `live`
  leaves out deprecated flags. The legacy `archived` parameter and filter are
  deprecated in favour of `state:archived` [spec].

Recommended request:

```
GET /api/v2/flags/{projectKey}?limit=100&sort=key[&filter=tags:a%2Bb]
LD-API-Version: 20240415
Authorization: <token>
```

Then follow `_links.next`. For tag filtering, use `filter=tags:a+b` (all
tags must match, and the `+` must be URL-encoded as `%2B`) rather than the
older single-value `tag` parameter [spec]. The design already re-checks tags
locally, which is still worth doing.

## 2. Where each FlagModel field lives

All of these are top-level properties of a `FeatureFlag` item [spec
`FeatureFlag`, gonfalon-rep]. Required means listed in the schema's
`required` array.

| FlagModel field | Response field | Notes |
| --- | --- | --- |
| `key` | `key` (string, required) | |
| `name` | `name` (string, required) | |
| `description` | `description` (string, optional) | Can be missing; treat as `""`. |
| `kind` | `kind` (`"boolean"` or `"multivariate"`, required) plus `variations[].value` | **`kind` never says string, number or JSON.** For `multivariate` the type has to be worked out from the JSON type of every `variations[].value`, which is what DESIGN already proposes. `Variation` also has optional `name`, `description` and `_id`. |
| `clientSideAvailability` | `clientSideAvailability: { usingEnvironmentId?: boolean, usingMobileKey?: boolean }` (optional) | Set on the flag, not per environment. Both inner fields are optional in the schema, so treat a missing one as `false`. The older `includeInSnippet` (boolean) is deprecated but still returned; it is the same thing as `usingEnvironmentId`. Use it as a fallback if `clientSideAvailability` is missing. |
| `tags` | `tags: string[]` (required) | |
| `maintainer` | **Either** `maintainerId` + `_maintainer` (`MemberSummary`: `_id`, `email` (required), `firstName?`, `lastName?`, `role`) **or** `maintainerTeamKey` + `_maintainerTeam` (`MaintainerTeam`: `key`, `name`) | All four are optional. A team has a key and a name but **no email**. |
| `archived` | `archived: boolean` (required), `archivedDate?` | Missing from the default list anyway (see §1). |
| `deprecated` | `deprecated?: boolean`, `deprecatedDate?` | `omitempty` on the server, so a missing field means `false` [gonfalon-rep]. See §3. |
| `nameOverrides` / `codegen.*` | `customProperties: { [key]: { name: string, value: string[] } }` (required, may be `{}`) | See §4. |
| `uiUrl` | not returned | The flag itself has only API `_links` (`self`, `parent`). The `_site` HTML link is only inside `environments[env]`, which we do not request. Build the URL from the configured app base URL (it differs for EU and federal instances), project key and flag key. |

Also present and possibly useful later: `temporary` (bool), `creationDate`,
`_version`, `_purpose` (for example `migration`), `defaults`.

## 3. LaunchDarkly's own deprecated marker (DESIGN OQ3)

**It exists and it is project-level.**

- The flag representation has `deprecated` (bool) and `deprecatedDate`
  [spec `FeatureFlag`, gonfalon-rep]. They are set on the flag itself, next
  to `archived` and `tags`, not inside `environments`.
- The docs say: "Deprecating a flag will remove it from the live **Flags**
  list for every environment in the project." It can be undone ("Restore"),
  and deprecated flags "are still evaluated, just like live flags"
  [deprecate].
- It can be set over the API with the semantic-patch instruction
  `deprecateFlag` [spec, update feature flag].
- Deprecated flags come back in the default list (see §1), so the fetcher
  does not need `filter=state:` to see them.
- **Limitation:** "You can only deprecate flags that you use with
  client-side SDKs" [deprecate]. Server-only flags can never carry
  LaunchDarkly's marker, so `codegen.deprecated` is the **only** way to
  deprecate them for the Go, Java and ts-server targets. This is a reason to
  keep the custom property, not to drop it.

## 4. Custom property keys and values

Wire shape [spec `CustomProperties`, `customProperty`]:

```json
"customProperties": {
  "codegen.name.go": { "name": "Codegen Go name", "value": ["CheckoutV2"] }
}
```

- **Values are always `string[]`.** The schema types `value` as an array of
  strings, and the server stores `Value []string` [gonfalon-cp]. There are
  no scalar, boolean or JSON values. "`codegen.deprecated` set" therefore
  means "the key is present". "Holds a string" has to mean "`value[0]`
  exists and is not empty". The normalizer should decide what to do with
  more than one value (suggestion: join them, or use the first and warn).
- **`codegen.name.go` is a legal key.** The server checks custom properties
  with only these rules [gonfalon-cp, custom-props]:
  - key is not blank and is at most 64 bytes;
  - `name` (the display label) is not blank and is at most 64 bytes, so it is
    **required**;
  - at most 64 custom properties per flag;
  - at most 64 values per property, each at most 65,536 bytes.
  The key has **no character restriction**, unlike flag keys. Dots are
  already used by LaunchDarkly's own reserved key `jira.issues`, which is also
  the example in the public spec [spec, gonfalon-cp].
- In the UI the person chooses a property **Type** (the name) and can edit
  the derived **Key** [custom-props]. Our docs should tell users to set the
  key exactly (for example `codegen.name.go`), because the UI default comes
  from the name. Integrations can register "reserved custom properties" so
  the key shows up in the UI picker
  (https://launchdarkly.com/docs/integrations/partner-integrations/custom-properties).
  That is a possible later improvement, not needed for v1.

## 5. Rate limits and retry

From [api-overview §Rate limiting]:

- A rate-limited call returns **429**, with body `{ code: "rate_limited",
  message }` [spec `RateLimitedErrorRep`].
- Several limits may apply to a call, each with its own headers, and "a
  response can include one, several, or none of these headers". The limits
  are not published and can change, so clients should read whichever headers
  are present:
  - Global (per account, per 10 s): `X-Ratelimit-Global-Limit`,
    `X-Ratelimit-Global-Remaining`, `X-Ratelimit-Reset`.
  - Route (per route, per 10 s): `X-Ratelimit-Route-Limit`,
    `X-Ratelimit-Route-Remaining`, `X-Ratelimit-Reset`.
  - Per access token: `X-Ratelimit-Auth-Token-Limit`,
    `X-Ratelimit-Auth-Token-Remaining`, `X-Ratelimit-Auth-Token-Reset`.
  - IP-based: `Retry-After` (seconds). "Clients must wait at least
    `Retry-After` seconds … and should employ jitter and backoff."
- `X-Ratelimit-Reset` and `X-Ratelimit-Auth-Token-Reset` are **epoch
  milliseconds**, not seconds and not a delta.
- 409 means "Retry your request", but that is for writes. The fetcher only
  reads.

Recommended fetcher behaviour:

1. On 429: if `Retry-After` is present, wait at least that many seconds.
   Otherwise wait until the latest `*-Reset` header present (epoch ms) minus
   the current time. With neither, use exponential backoff starting at about
   1 s. Add jitter every time and cap the number of retries (for example 5)
   and the total wait (for example 60 s). After that, exit 2.
2. Optionally, if any `*-Remaining` header is 0 before the last page, sleep
   until the matching reset instead of waiting for the 429.
3. Retry 5xx and network errors with the same bounded backoff. Do not retry
   other 4xx responses.

Pages of 100 and a 10-second window mean a project with a few thousand flags
needs only a few dozen requests. Rate limits should rarely be hit unless the
account's global limit is already busy, for example from Terraform or other
integrations sharing it.

## Where this disagrees with DESIGN.md

1. **"Requesting the fields the model needs"** (Fetcher section). The API
   has no field selection. The fetcher can only avoid extra data by not
   sending `env` and `expand`. Snapshots (`--write-snapshot`) should store
   either the normalized fields or the raw items. If they store raw items,
   expect them to be larger than the model needs.
2. **`maintainer?: { email: string; name?: string }`.** A flag can be
   maintained by a **team**, which has a key and a name but no email. The
   model needs something like
   `{ kind: 'member', email, name? } | { kind: 'team', key, name }`, and the
   doc-comment trailer needs a format for teams.
3. **`kind` "derived from the flag's variation type".** This is correct,
   but `kind` from the API is only `boolean` or `multivariate`, so
   string/number/json always comes from looking at the variation values. If a
   `boolean` flag's values are not all booleans, it should be a hard error,
   not a fallback to `json`.
4. **Deprecation (OQ3).** The marker exists and is project-level, which
   settles OQ3. But it can only be set on client-side flags, so server-only
   flags rely entirely on `codegen.deprecated`. "`codegen.deprecated` holds a
   string" has to be read as "its `value` array has a non-empty first
   element", because values are always arrays.
5. **`uiUrl`.** The flag list does not return a UI link for the flag itself.
   It has to be built from a base URL, which differs for the EU and federal
   instances, so it should be configurable.
6. **Client-side availability (OQ4).** `clientSideAvailability` is a flag
   field, not an environment field, so the browser filter works without an
   environment. Older flags may have only `includeInSnippet`. Fall back to it
   when `clientSideAvailability` is missing. This is not confirmed against a
   live pre-migration project.

## Not confirmed from a primary source

- **No live sample response.** No token was available. The field list comes
  from the spec and the server representation. It has not been checked
  against an actual list response, for example whether `_maintainer` or
  `_maintainerTeam` is filled in on list items or only on single-flag reads.
  Record a sample with `LD_API_TOKEN` before building the fetcher tests.
- **Whether the maximum `limit` of 100 is enforced.** The public migration
  guide states it. The server has a dogfood flag `flag-list-max-limit`
  (default `-1`, unlimited) that controls enforcement, and an internal design
  page from 2023 says it was not enabled at the time
  (https://launchdarkly.atlassian.net/wiki/spaces/ENG/pages/2464120907).
  Treat 100 as the documented contract and follow `_links.next` either way.
- **OQ4 for very old projects.** Not checked against a real project created
  before the `clientSideAvailability` setting existed.
