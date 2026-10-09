# Views API: resolving a view to its flag set

Research for issue #7 (DESIGN.md open question 2). Researched 2026-10-09.

Already decided, not covered here: a config that sets both `view` and `tags` is rejected.

## Sources

Public, primary:

- **[S1] Official OpenAPI spec**, `https://app.launchdarkly.com/api/v2/openapi.json` (fetched 2026-10-09). This is the spec the official API clients are generated from. Operations: `getView`, `getViews`, `getLinkedResources`, `getLinkedViews`, `getFeatureFlags`. Schemas: `View`, `ViewLinkedResources`, `ViewLinkedResource`, `ExpandedLinkedFlags`, `ExpandedFlag`, `ViewLinkRequestFilter`.
- **[S2] Views Beta API reference**: https://launchdarkly.com/docs/api/views-beta (for example https://launchdarkly.com/docs/api/views-beta/get-linked-resources). The pages are rendered from S1.
- **[S3] REST API overview**: https://launchdarkly.com/docs/api, the "Authentication" and "Beta resources" sections.
- **[S4] Views product docs**: https://launchdarkly.com/docs/home/account/views, https://launchdarkly.com/docs/home/account/views/create, https://launchdarkly.com/docs/home/account/views/manage, https://launchdarkly.com/docs/guides/account/views-onboarding
- **[S5] Role actions, "View actions"**: https://launchdarkly.com/docs/home/account/roles/role-actions
- **[S6] Official Terraform provider docs** for `launchdarkly_view_links` and `launchdarkly_view_filter_links`: https://github.com/launchdarkly/terraform-provider-launchdarkly/blob/main/docs/resources/view_filter_links.md

Internal to LaunchDarkly, found through Glean. Only LaunchDarkly employees can open these:

- **[I1]** gonfalon (the REST API implementation): `internal/flags/filters/filter_parser.go` and `internal/flags/flag_store.go`. https://github.com/launchdarkly/gonfalon/blob/main/internal/flags/flag_store.go
- **[I2]** gram-functions PR #188, "filter by view" for the MCP tools. It was checked against gonfalon and against staging. https://github.com/launchdarkly/gram-functions/pull/188
- **[I3]** Launch Brief: Views, https://launchdarkly.atlassian.net/wiki/spaces/PD/pages/4531290185
- **[I4]** Support ticket 127621, "Views (beta) API response no longer includes `archived` field". https://launchdarklysupport.zendesk.com/agent/tickets/127621

## Answers

### 1. Endpoints, auth, pagination

**Resolving a view to its flags: `GET /api/v2/projects/{projectKey}/views/{viewKey}/linked/flags`** (`getLinkedResources` with `resourceType=flags`) [S1, S2].

- Required header: `LD-API-Version: beta` [S1].
- Query parameters [S1]:
  - `limit`, `offset`
  - `sort`: `linkedAt` (the default, ascending) or `name`
  - `query`: case-insensitive match on the key
  - `filter`: uses the flag-list filter syntax
  - `expand`: `maintainer` or `resourceDetails`
- Response is `ViewLinkedResources` [S1]:
  - `{ items, totalCount, _links: { self, first, prev, next, last } }`.
  - Each item has `resourceKey`, `resourceType` (`"flag"`), `linkedAt`, and an optional `resourceDetails.flag`.
- Pagination is offset/limit. Follow `_links.next` until it is missing, or stop when `offset >= totalCount`. The spec documents neither a default page size nor a maximum `limit`.

Other endpoints in the same tag that are useful here [S1]:

- **`GET /api/v2/projects/{projectKey}/views/{viewKey}`** (`getView`) returns the view's metadata (`key`, `name`, `projectKey`, `tags`, `deleted`, and so on).
  - `expand=flagsSummary` adds a `count`. `expand=allFlags` adds `flagsExpanded { items, totalCount }`.
  - The expansion has no page parameters of its own, and the spec does not say whether it is capped. Do not rely on it as the full member list.
- **`GET /api/v2/projects/{projectKey}/views`** (`getViews`) lists views. It supports `filter=key equals …` and others.
- **`GET /api/v2/projects/{projectKey}/view-associations/flags/{flagKey}`** (`getLinkedViews`) is the reverse lookup, one flag at a time. It does not fit bulk use.

A linked item has only key-level data. `ExpandedFlag` is described as "contains only fields actually used by the Views service" [S1]:

- It has: key, name, description, tags, archived, temporary, maintainer, `_version`.
- It lacks: `kind`, variations, client-side availability, custom properties, deprecated state.

So the fetcher still needs `GET /api/v2/flags/{projectKey}` for the FlagModel, as DESIGN.md already assumes.

**Auth** [S1, S3]:

- An `Authorization: <access token>` header carrying a personal or service access token. The OpenAPI security scheme is `ApiKey` with `read` and `write` scopes, and a read-only token is enough for these GETs.
- The role actions page lists only write actions for views: create, delete, link, unlink [S5]. It lists no separate "read view" action, so reading appears to be governed by ordinary project access. This is an inference; the docs do not state it.
- Views are only on select plans: "Views are only available to customers on select plans" [S4]. The Terraform docs and the internal launch brief say Enterprise [S6, I3].

### 2. Can the flags list filter by view directly?

**Not according to the public contract.** The public `getFeatureFlags` description lists every `filter` field it supports [S1]: `applicationEvaluated`, `archived`, `contextKindsEvaluated`, `codeReferences.*`, `creationDate`, `evaluated`, `filterEnv`, `guardedRollout`, `hasExperiment`, `maintainerId`, `maintainerTeamKey`, `query`, `releasePipeline`, `state`, `sdkAvailability`, `tags`, `type`. There is no `view`.

**In practice, yes, but undocumented.** gonfalon's flag filter parser accepts `view` [I1]. `GET /api/v2/flags/{projectKey}?filter=view:<viewKey>` works, and it is the shorthand the LaunchDarkly UI's "View" menu on the Flags list uses [I2]. It was confirmed against staging with `totalCount: 1` for a one-flag view [I2]. Internally it calls `GetFlagsForView` and then filters, so the server does the intersection [I1].

**Recommendation:**

- Treat `filter=view:` as an optimisation that is not part of the contract.
- The documented route is to list view members through `linked/flags` with pagination, then intersect locally with the full flag list. This matches what DESIGN.md already says ("resolves the view to its flag set through the views API and intersects").
- If we adopt `filter=view:` later, re-check locally in the same way the tag filter does. A good place to do that is a single-request fast path that falls back to `linked/flags`.
- Since the user works at LaunchDarkly, getting `view` added to the public filter table would remove this ambiguity.

### 3. Unknown view key, and project scoping

**Views are project-scoped** [S1, S4]:

- Every views path is under `/projects/{projectKey}/`.
- `View` carries `projectId` and `projectKey`, and `key` is "unique … within the account/project".
- The docs say views "group flags … within a project" and allow "up to 300 views per project" [S4].
- The same view key can exist in two projects, so the generator must always send the configured `project`.

**View keys are lowercased on creation** [S1, `ViewPost.key`: "converted to lowercase when the view is created, so use the lowercase form to reference the view afterward"]. A view's key cannot be changed after creation [S4, manage]. The generator should lowercase the configured key or reject a key that contains uppercase. Names can be edited and are not identifiers.

**Unknown view key on the views endpoints:**

- `getView` and `getLinkedResources` both declare a `404 Not found` response with the standard `Error` body [S1].
- The spec does not say that an unknown `viewKey` specifically produces the 404. A 403 is also documented, and is what you get without the beta header [S3].
- I did not confirm this with a live call. No API token was available in this session.

**Unknown view key on `filter=view:` (undocumented):**

- gonfalon maps the views service's NotFound to **HTTP 400 with error code `view_not_found`**, message "View not found" [I1].
- The code comment says this exists so the frontend can recover from "a view key carried over from another project".

**Deleted views:** `View` has `deleted` and `deletedAt` [S1]. Deleting a view unlinks all of its resources [S4, manage]. If a deleted view can still be read and returns `deleted: true`, the fetcher should treat that as unknown. I could not confirm whether a deleted view returns 404 or `deleted: true`.

**Membership is explicit:**

- Flags are linked to a view by key or by a filter. A filter link is a one-time "union" at the moment of the call. Terraform's docs: "Filter-based links are point-in-time" [S1 `linkResource`, S6].
- A view does not pick up new flags that match its original filter. Users who expect tag-like behaviour should be told this in our docs.

### 4. Stable/GA or beta?

**The REST API is beta.** The OpenAPI tag is `Views (beta)`, and every views operation has the header parameter `LD-API-Version` as `required: true` with `enum: ["beta"]` [S1].

From the beta notice [S3]:

- "If you call a beta resource without this header, you receive a `403` response."
- Beta resources "may change without notice, including becoming backwards incompatible."

**The product feature is GA for Enterprise** (launch brief: "GA for Enterprise 2026-03-05") [I3]. The API stayed beta.

The beta warning is real. The `archived` field was removed from the `View` response in 2026 without a changelog entry, and that broke the Terraform provider v2.x [I4]. The current spec has `deleted`/`deletedAt` and no `archived` [S1].

The undocumented `filter=view:` lives on the non-beta flags endpoint. It is not covered by the beta contract or by the GA contract.

## Implications for DESIGN.md

These are the places where the design is incomplete or contradicts the findings.

1. **`--view name` and `LD_CODEGEN_VIEW` should take a view key, not a name.** The CLI synopsis in DESIGN.md says `--view name`. Views are addressed only by key, keys are lowercase, and names can be edited [S1, S4].
2. **The fetcher must send `LD-API-Version: beta` on views calls, and must expect breaking changes.** DESIGN.md treats the views API like the GA flags API. Parse only `resourceKey`, `totalCount` and `_links.next` from `linked/flags`, so that changes to the shape of the beta response do not break us. Reading only these fields keeps us clear of drift like the `archived` removal [I4].
3. **Views are plan-gated (Enterprise)** [S4, S6, I3]. DESIGN.md presents `view` as a general selection mode. Document the restriction. Also map whatever error a non-entitled account gets (unconfirmed; likely 403 or 404) to exit code 2 with a clear message.
4. **Unknown view should be exit 2 (configuration error), not an empty flag set.** DESIGN.md's failure-mode table has no row for this case. Without a rule, an unknown view might generate an empty wrapper, and `check` would report that as drift.
5. **There is no way to filter by view on the server through the public contract.** DESIGN.md's "resolve and intersect" approach is right. The undocumented `filter=view:` is a possible optimisation and should not be the primary path.
6. **Snapshot contents.** `--write-snapshot` should record the view key and the resolved member keys, so that `--from-snapshot` reproduces a run filtered by view offline.

## Not confirmed from a primary source

- That an unknown `viewKey` on the beta views endpoints returns 404 and not 403 or 400. The spec lists 404 among the declared responses but does not tie it to an unknown key, and I made no live call.
- The default and maximum `limit` for `linked/flags`.
- Whether `getView?expand=allFlags` is capped.
- Whether a deleted view returns 404 or `deleted: true`.
- What a non-Enterprise account gets back from the views endpoints.
- Whether `filter=view:` on the flags list needs the beta header or an entitlement. Internal evidence [I2] suggests it works without the header, and it is undocumented.
- That reading views needs no role action beyond project access. This is inferred from the role-actions list [S5].
