# API reference

Every endpoint the server exposes. Unless noted, requests require an authenticated
session cookie (`gitstars.sid`) and responses are JSON.

- [Conventions](#conventions)
- [Health](#health)
- [Auth](#auth)
- [Sync](#sync)
- [Repositories](#repositories)
- [Tags](#tags)
- [Notes](#notes)
- [GitHub passthrough](#github-passthrough)
- [Releases](#releases)
- [Export and import](#export-and-import)
- [Objects](#objects)

## Conventions

**Authentication.** Unauthenticated requests get `401 {"error": "Unauthorized"}` (or
`{"error": "Authentication required"}` under `/api/releases`). There is no token or API
key — sign in through the browser and reuse the cookie:

```bash
# grab a session by signing in at http://localhost:4000, then:
curl -b "gitstars.sid=<value>" http://localhost:4000/api/stats
```

**Scoping.** Every endpoint is implicitly scoped to the signed-in user. A repository id
belonging to someone else returns `404`, never someone else's data.

**Errors.** `{"error": "..."}`, with the HTTP status carrying the meaning. Endpoints
under `/api/releases` additionally include `"success": false`. In non-production a
`details` field carries the underlying message.

| Status | Means |
| --- | --- |
| `400` | Malformed input — bad id, invalid tag, unknown `action` |
| `401` | No session |
| `404` | Not yours, or does not exist. Also returned for unknown `/api` and `/auth` paths. |
| `502` | GitHub was reachable but unhappy |
| `503` | Database unavailable (`/api/health`), or frontend build missing |

**Booleans in query strings** are `true` or `1`. Anything else reads as false.

**Ids** are the internal numeric `Repo.id`, not GitHub's id.

## Health

### `GET /api/health`

No authentication. The Docker and Compose health checks use this.

```json
{ "status": "ok", "database": "ok", "frontend": "ok", "uptime": 1234 }
```

`200` when the database answers; `503` with `"status": "degraded"` and
`"database": "unavailable"` when it does not. `frontend` is `"missing"` when the
exported build is not where the server expects it — the API still works.

## Auth

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/auth/github` | Start the OAuth flow. Redirects to GitHub. |
| `GET` | `/auth/github/callback` | OAuth return. `302` to `/dashboard/`, or `/?error=auth_failed`. |
| `GET` | `/auth/user` | The signed-in user |
| `POST` | `/auth/logout` | Destroy the session and clear the cookie. `200`, no body. |

`GET /auth/user` returns exactly these fields — never the access token:

```json
{ "id": 1, "githubId": "12345", "username": "octocat",
  "email": "octocat@example.com", "avatarUrl": "https://..." }
```

## Sync

### `POST /api/sync`

Starts a background star sync. Returns immediately.

| Status | Body | Meaning |
| --- | --- | --- |
| `202` | `{ "started": true, "status": {…} }` | A sync began |
| `200` | `{ "started": false, "status": {…} }` | One was already running; nothing new started |

Concurrent calls are serialised with a PostgreSQL advisory lock, so double-clicking
**Sync** cannot start two.

### `GET /api/sync/status`

Progress of the most recent sync attempt.

```json
{ "id": 42, "status": "in_progress", "progress": 63.5, "error": null,
  "startedAt": "2026-07-26T09:00:00.000Z", "updatedAt": "2026-07-26T09:01:12.000Z",
  "lastCompletedAt": "2026-07-25T09:04:31.000Z" }
```

`status` is one of `pending`, `in_progress`, `completed`, `failed`. With no history it
reports `completed` at `100`. A completed sync can still carry an `error` string — that
is how "GitHub returned no starred repositories; kept the existing list untouched." is
surfaced.

## Repositories

### `GET /api/repos`

| Parameter | Default | Effect |
| --- | --- | --- |
| `tags` | — | Comma-separated. Matches custom tags **or** language **or** topics. |
| `sort` | `starredAt` | `starredAt`, `stargazersCount`, `name`, `fullName`, `forksCount`, `pushedAt`, `githubUpdatedAt` |
| `order` | `desc` | `asc` or `desc`. NULLs always sort last. |
| `includeUnfollowed` | `false` | Include un-starred repositories |
| `onlyUnfollowed` | `false` | *Only* un-starred repositories (overrides the above) |
| `updateAvailable` | — | Filter on the flag |
| `archived` | — | Filter on the flag |
| `fork` | — | Filter on the flag |

Unrecognised `sort`/`order` values fall back to the defaults rather than erroring.

```json
{ "repos": [ /* Repository objects */ ] }
```

Returns the full list — there is no pagination. The dashboard fetches everything once
with `includeUnfollowed=true` and filters client-side, which keeps tag filtering and
boolean expressions instant. Release rows are deliberately **not** joined in; the
columns the list needs (`latestVersion`, `currentlyUsedVersion`, `updateAvailable`) live
on the repository itself, and a `hasMany` include with a limit makes Sequelize emit one
`UNION ALL` branch per row.

### `GET /api/stats`

Aggregates, computed in PostgreSQL. Counts cover followed repositories only, except
`total` and `unfollowed`.

```json
{ "total": 1200, "followed": 1187, "unfollowed": 13, "updatesAvailable": 4,
  "archived": 31, "untagged": 402, "totalStars": 5400321 }
```

### `DELETE /api/repos/unfollowed`

Permanently deletes un-starred repositories — with their tags, notes and version
choices. This is the only destructive endpoint; a sync never deletes.

```json
{ "deleted": 13 }
```

## Tags

Tags match `^[\w.-]+$` (letters, digits, `_`, `.`, `-`), are at most 50 characters, and
a repository holds at most 100. Validation runs server-side on every tag endpoint.
Where a payload takes `tags`, it accepts a single string, a whitespace/comma-separated
string, or an array.

### `GET /api/custom-tags`

Every custom tag you have used, alphabetically. `["cli", "rust", "version-tracking"]`

### `GET /api/tags/counts`

Custom tags, topics and languages in one list, most-used first, over followed
repositories.

```json
[ { "tag": "rust", "count": 84 }, { "tag": "cli", "count": 61 } ]
```

The type of each entry is not distinguished here; the sidebar re-derives it.

### `POST /api/repos/:id/tags`

```json
{ "tags": ["rust", "cli"], "action": "add" }
```

`action` is `add` (default) or `delete`. Returns the repository's resulting tag list:

```json
{ "id": 17, "tags": ["cli", "rust"] }
```

`400` if a tag is invalid, or if adding would exceed 100 tags.

### `DELETE /api/repos/:id/tags`

Same body without `action`; removes the listed tags. Equivalent to the `delete` action
above.

### `POST /api/repos/bulk-tags`

Apply or remove one set of tags across many repositories in a single transaction. Up to
2000 ids.

```json
{ "repoIds": [1, 2, 3], "tags": ["archive-candidate"], "action": "add" }
```

```json
{ "action": "add", "tags": ["archive-candidate"],
  "updated": [ { "id": 1, "tags": ["archive-candidate"] } ], "updatedCount": 1 }
```

Repositories already in the requested state are skipped and not counted. Ids that are
not yours are silently ignored.

### `PATCH /api/tags/:tag`

Rename a tag everywhere. Body: `{ "tag": "new-name" }`.

```json
{ "from": "old-name", "to": "new-name", "updatedCount": 37 }
```

Renaming to a tag a repository already has merges rather than duplicating.

### `DELETE /api/tags/:tag`

Remove a tag from every repository. `{ "tag": "obsolete", "updatedCount": 12 }`

## Notes

### `PUT /api/repos/:id/notes`

```json
{ "notes": "Using this for the deploy scripts. Watch out for the 3.x rewrite." }
```

Max 20 000 characters. `null` or a whitespace-only string clears the note. Notes are
searched alongside name and description in the dashboard.

```json
{ "id": 17, "notes": "Using this for..." }
```

## GitHub passthrough

Two endpoints proxy GitHub with your stored token, so the browser never sees it.

### `GET /api/repos/:owner/:repo/readme`

Returns the raw README as `text/plain`. Cached per user for 6 hours (LRU, 1000 entries);
`?refresh=true` bypasses the cache. If GitHub fails and a stale copy exists, the stale
copy is served instead of an error. `404` when the repository has no README, `502` for
anything else.

### `GET /api/repos/:owner/:name`

GitHub's repository object, plus a camelCase `defaultBranch` alongside GitHub's
`default_branch`. Not cached.

## Releases

Mounted under `/api/releases`. These endpoints wrap their responses in `success`.

### `GET /api/releases/repo/:repoId`

Releases for one repository, newest first. Refreshes from GitHub if the cached copy is
over 24 hours old, or always with `?refresh=true`.

```json
{ "success": true,
  "releases": [ { "id": 9, "tagName": "v2.1.0", "name": "2.1.0", "body": "…",
                  "publishedAt": "2026-07-01T00:00:00.000Z",
                  "isPrerelease": false, "isDraft": false } ],
  "repo": { "id": 17, "latestVersion": "v2.1.0", "currentlyUsedVersion": "v2.0.3",
            "updateAvailable": true, "hasReleases": true,
            "releasesLastFetched": "2026-07-26T08:00:00.000Z" } }
```

Drafts are filtered out before storage — they are not installable and have no publish
date.

### `GET /api/releases/repo/:repoId/newer-versions`

Every release published after the one you marked as in use — the payload behind **Copy
changelog**. Empty when the repository has no releases or no version is selected. If
your selected version is no longer present, all known releases are returned.

```json
{ "success": true, "releases": [ /* oldest first */ ], "currentVersion": "v2.0.3" }
```

### `PATCH /api/releases/repo/:repoId/version`

Set the version you run. Body: `{ "currentlyUsedVersion": "v2.0.3" }` (`selectedVersion`
is accepted as a legacy alias). `null` means "not using", which suppresses update flags
for that repository.

```json
{ "success": true,
  "repo": { "id": 17, "latestVersion": "v2.1.0", "currentlyUsedVersion": "v2.0.3",
            "updateAvailable": true, "effectiveVersion": "v2.0.3" } }
```

`400` if the tag is not one of the repository's known releases. If the repository has
never had its releases fetched, this endpoint fetches them first.

### `POST /api/releases/bulk-fetch`

Refresh releases for repositories that are due one.

```json
{ "limit": 20, "repoIds": null }
```

`limit` is capped at 50 per call. `repoIds` restricts the set; an empty array matches
nothing. Un-starred repositories are never fetched. There is a 1-second pause between
repositories and the run stops early when the GitHub rate limit falls below 50.

```json
{ "success": true,
  "results": { "processed": 20, "successful": 19, "failed": 1,
               "skippedRateLimit": 0,
               "errors": [ { "repoId": 8, "repoName": "o/r", "error": "Not Found" } ] } }
```

## Export and import

### `GET /api/export`

Everything you created by hand — sent as a file download. Repositories with no tags, no
note and no version choice are omitted.

```json
{ "version": 1, "exportedAt": "2026-07-26T10:00:00.000Z", "username": "octocat",
  "repositories": [ { "githubId": "1296269", "fullName": "octocat/Hello-World",
                      "customTags": ["cli"], "notes": "…",
                      "currentlyUsedVersion": "v1.2.0", "isFollowed": true } ] }
```

### `POST /api/import`

```json
{ "repositories": [ /* as exported */ ], "mode": "merge" }
```

Entries are matched by `githubId` first, then by `fullName`, so an export taken before a
repository was renamed still applies. Up to 2000 entries.

| `mode` | Behaviour |
| --- | --- |
| `merge` (default) | Tags are unioned; notes and version only fill empty fields |
| `replace` | Tags, notes and version overwrite what is there |

Import only ever touches repositories already in your account — it cannot create rows.
Sync first, then import.

```json
{ "updated": 314, "skipped": 2,
  "notFound": ["someone/deleted-repo"],
  "invalid": [ { "repo": "o/r", "error": "Tag \"bad tag!\" may only contain…" } ] }
```

## Objects

### Repository

Returned by `GET /api/repos`. Mirrors `new_frontend/lib/types.ts`.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | number | Internal id — the one every endpoint takes |
| `githubId` | string | Unique per user, **not** globally |
| `name`, `fullName`, `owner` | string | |
| `description` | string \| null | |
| `url` | string | `html_url` on GitHub |
| `customTags` | string[] | Yours. Stored in the `tags` column. |
| `notes` | string \| null | Yours |
| `topics` | string[] | GitHub's |
| `language` | string \| null | GitHub's |
| `starredAt` | string \| null | When *you* starred it |
| `stargazersCount`, `forksCount`, `watchersCount` | number | |
| `fork`, `archived`, `isTemplate` | boolean | |
| `visibility` | string | `public` / `private` |
| `defaultBranch` | string \| null | Used to resolve relative README links |
| `pushedAt`, `githubCreatedAt`, `githubUpdatedAt` | string \| null | |
| `isFollowed` | boolean | `false` once un-starred; the row is kept |
| `latestVersion` | string \| null | Newest non-prerelease tag |
| `currentlyUsedVersion` | string \| null | Yours. `null` = "not using". |
| `effectiveVersion` | string \| null | Computed: your choice, or `latestVersion` before releases have ever been fetched |
| `updateAvailable` | boolean | Both versions known and different |
| `hasReleases` | boolean | |
| `releasesLastFetched` | string \| null | |
| `releasesFetchError` | string \| null | Why the last fetch failed |
| `createdAt`, `updatedAt`, `UserId` | | Row metadata |
