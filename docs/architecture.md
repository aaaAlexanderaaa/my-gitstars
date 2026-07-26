# Architecture

How the pieces fit together, and — more usefully — *why* several of them are shaped the
way they are. Most of the odd-looking decisions below exist because the obvious version
lost user data or silently did nothing.

- [Shape of the system](#shape-of-the-system)
- [Request lifecycle](#request-lifecycle)
- [Authentication and sessions](#authentication-and-sessions)
- [Data model](#data-model)
- [Star sync](#star-sync)
- [Release tracking](#release-tracking)
- [Talking to GitHub](#talking-to-github)
- [README proxy and cache](#readme-proxy-and-cache)
- [Schedulers](#schedulers)
- [Invariants worth protecting](#invariants-worth-protecting)

## Shape of the system

One Express process serves everything:

```
                       ┌────────────────────────────────────────────┐
  browser ────────────►│ Express (backend/src/index.js)             │
   session cookie      │                                            │
                       │  /api/health         health + db + build   │
                       │  /auth/*             OAuth, session, user  │
                       │  /api/*              repos, tags, sync     │
                       │  /api/releases/*     releases, versions    │
                       │  everything else     static Next.js export │
                       └───────┬──────────────────────────┬─────────┘
                               │                          │
                    ┌──────────▼─────────┐     ┌──────────▼──────────┐
                    │ PostgreSQL         │     │ api.github.com      │
                    │ (Sequelize)        │     │ (Octokit + axios)   │
                    └────────────────────┘     └─────────────────────┘
                               ▲
                    ┌──────────┴─────────┐
                    │ schedulers         │  star sync + version tracking
                    │ (same process)     │
                    └────────────────────┘
```

There is no separate worker, queue or cache server. Background work runs as promises in
the API process, and "cache" means a PostgreSQL row or an in-process LRU map. For a
single-user or small-team self-hosted tool this is the right trade: one container to
run, one database to back up.

The frontend is a **static export**. `next build` with `output: 'export'` produces
plain HTML/JS in `new_frontend/out`, which Express serves. No Node.js rendering, no
`next start`, no second port in production.

## Request lifecycle

`backend/src/index.js` wires three modules in a fixed order, and the order matters:

1. **`config/middleware.js`** — security headers, CORS, `express.json({ limit: '4mb' })`,
   the PostgreSQL-backed session store, then Passport. Sessions must be installed before
   any route that reads `req.user`.
2. **`config/passport.js`** — the GitHub strategy and the `serializeUser` /
   `deserializeUser` pair.
3. **`config/routes.js`** — health, the four routers, the API 404 guard, static assets,
   the SPA fallback, and finally the error handler.

Two details in `config/routes.js` are load-bearing:

- **Unknown `/api` and `/auth` paths return JSON 404s.** They are caught *before* the
  static handler. Previously they fell through to the SPA fallback, so a typo'd endpoint
  answered `200 text/html` and the frontend tried to `JSON.parse` a web page.
- **The catch-all returns 404, not 200.** Every real page is pre-rendered by
  `next build`, so anything reaching the fallback genuinely does not exist. If the
  frontend build is missing entirely the fallback returns `503` with the command that
  fixes it, rather than a blank page.

Static assets are cached by class: `.html` gets `no-cache`, hashed bundles under
`_next/static/` get `max-age=31536000, immutable`.

The error handler is registered last so it can actually catch errors from the routes
above it, and it only leaks `err.message` when `NODE_ENV !== 'production'`.

## Authentication and sessions

```
GET /auth/github ──► GitHub consent ──► GET /auth/github/callback ──► 302 /dashboard/
                                              │
                                              ├─ find-or-create User by githubId
                                              ├─ refresh username/email/avatar/token
                                              └─ session cookie "gitstars.sid"
```

- **Scopes** come from `GITHUB_OAUTH_SCOPE`, default `read:user,user:email,repo`. The
  `repo` scope is only needed to see stars on *private* repositories.
- **`state: true`** is set on the strategy. Without it, `passport-oauth2` uses a
  `NullStore` for the OAuth `state` nonce and the callback is replayable.
- **Sessions live in PostgreSQL** (`connect-session-sequelize`, table `Sessions`).
  The dependency was declared but never wired up at one point, which silently fell back
  to express-session's in-memory store: every restart logged everyone out, and it leaks
  under load.
- **Cookie**: `httpOnly`, `sameSite: 'lax'`, 24h lifetime. `lax` still sends the cookie
  on the top-level OAuth redirect back from GitHub while blocking cross-site POSTs,
  which is the CSRF defence. `secure` is derived from `APP_URL` (`https://` ⇒ true) and
  can be forced with `COOKIE_SECURE` when TLS terminates upstream.
- **CORS** is an allow-list, not a mirror. Reflecting the caller's `Origin` while also
  sending `Access-Control-Allow-Credentials: true` would let any site read a logged-in
  user's repositories. In the packaged app the list is just `APP_URL`; in development it
  also includes `localhost:3000` and `127.0.0.1:3000`.
- **`deserializeUser` resolves to `false`** for a deleted user, so an old session cannot
  outlive its account.
- **Only a whitelist of user fields is ever serialised** to the client (`publicUser` in
  `routes/auth.js`). The `User` row holds the GitHub access token; `/auth/user` is
  readable by any script on the page.

## Data model

Four tables, plus `Sessions` (managed by the session store) and `SequelizeMeta`
(managed by the migration runner).

```
Users ──┬──< Repos ──< Releases
        └──< SyncStatuses
```

**`Users`** — `githubId` (unique), `username`, `email`, `avatarUrl`, `accessToken`.

**`Repos`** — a per-user copy of a starred repository. GitHub-owned columns
(`name`, `description`, `language`, `topics`, `stargazersCount`, `defaultBranch`,
`archived`, …) plus four user-owned ones that a sync must never touch:

| Column | Meaning |
| --- | --- |
| `tags` (`customTags`) | Text array of hand-applied tags |
| `notes` | Free-form markdown, max 20 000 chars |
| `currently_used_version` | The release tag *you* run |
| `is_followed` | `false` once you un-star it — the row survives |

> **`githubId` is not globally unique.** It is unique *per user*, via the
> `repos_user_id_github_id_unique` index added in
> `migrations/20240320000009-scope-repos-per-user.js`. When it was globally unique, two
> users starring the same repository fought over one row: whoever synced last took
> ownership of the other's tags and notes. `test/repo-isolation.test.js` exists to keep
> that from coming back.

**`SyncStatuses`** — one row per sync attempt: `status`
(`pending` / `in_progress` / `completed` / `failed`), `progress` (0–100), `error`.
History is kept, so "last successful sync" is a query rather than a mutable field.

**`Releases`** — keyed by `(repoId, githubReleaseId)`. GitHub's numeric release id is
the stable identifier; keying on `tagName` would create phantom rows every time a
maintainer retags a release.

Migrations are plain `sequelize-cli` files in `backend/migrations/`, applied
automatically at container start. CI additionally rolls the last two back and re-applies
them, so `down` is not allowed to rot.

## Star sync

```
POST /api/sync
      │
      ├─ transaction ──► pg_advisory_xact_lock(4242, userId)
      │                  ├─ an in-progress sync? ──► return {started: false}
      │                  ├─ stale (no progress for SYNC_STALE_AFTER_MS)? ──► mark failed
      │                  └─ create SyncStatus(in_progress)
      │
      └─ t.afterCommit ──► backgroundSync()   (fire-and-forget promise)
                              │
                              ├─ getAllStarredRepos()          paginated, retried
                              ├─ upsert in batches of 100      progress after each batch
                              ├─ reconcileUnfollowed()
                              └─ bulkFetchReleases(limit 30)   non-blocking
```

Three decisions worth knowing:

**The advisory lock.** `SELECT ... FOR UPDATE` only locks rows that already exist, so
when no sync was running there was nothing to lock and two concurrent requests both got
past the check. `pg_advisory_xact_lock` serialises them properly and releases on commit
or rollback.

**`afterCommit`.** The background job is kicked off only once the transaction has
committed. Starting it inside the transaction meant `backgroundSync` could look for a
`SyncStatus` row that was not visible to its own connection yet.

**The upsert conflict target.** `Repo.upsert()` passes
`conflictFields: ['UserId', 'githubId']` explicitly. Without it, Sequelize infers the
target from the unique index on `githubId` alone and the row gets reassigned to whoever
synced last. `isFollowed: true` is passed explicitly on every upsert so that re-starring
a repository clears a previous unfollow — a column only lands in the `ON CONFLICT`
update list when it is supplied.

**Staleness is measured from the last update, not creation.** A sync for an account with
thousands of stars legitimately runs a long time while bumping `progress`; judging it by
`createdAt` would kill it mid-run.

### Un-starring never deletes

`reconcileUnfollowed` marks rows `is_followed = false` instead of deleting them, because
the row carries tags, notes and a version choice that are unrecoverable. Purging is an
explicit, separate action (`DELETE /api/repos/unfollowed`).

And if GitHub returns **zero** stars, the sweep is skipped entirely:

```js
if (currentStarIds.length === 0) { /* count existing rows, warn, skip */ }
```

An empty list is far more often a transient GitHub response than a user un-starring
everything — and `Op.notIn: []` is *silently dropped* by Sequelize, which would have
turned the sweep into an unscoped "mark everything unfollowed". The sync reports this in
`SyncStatus.error` rather than pretending it succeeded quietly.

## Release tracking

Releases are fetched per repository and cached for 24 hours in the database.

```
fetchAndStoreReleases(repoId, user)
   ├─ GET /repos/:owner/:repo/releases        newest 30
   ├─ drop drafts                             not installable, and undated
   ├─ sort by publishedAt DESC                the list endpoint orders by created_at
   ├─ findOrCreate/update each release        keyed on githubReleaseId
   ├─ pruneDeletedReleases()                  within the fetched window only
   └─ update Repo: latestVersion, hasReleases, updateAvailable, releasesLastFetched
```

- **"Latest" is the newest non-prerelease**, falling back to the newest release overall
  so that projects which only ever ship pre-releases still report a version.
- **Your choice is adopted once and then never overwritten.** `currentlyUsedVersion` is
  auto-filled only on the first successful fetch that finds releases
  (`!repo.currentlyUsedVersion && !repo.hasReleases`).
- **"Not using" is a real state.** A `null` version means no update is available;
  comparing `null` against `latestVersion` used to flag such repos forever.
- **A repo with no releases gets its version fields cleared.** Leaving a stale
  `latestVersion` behind kept it permanently flagged as updatable.
- **Failures back off without lying.** On error, `releasesLastFetched` is stamped as
  `now - (24h - 30min)` so the retry happens in 30 minutes instead of a full day, and
  the reason is stored in `releases_fetch_error`.
- **Pruning is windowed.** Only the newest page is fetched, so
  `pruneDeletedReleases` deletes only rows newer than the oldest release in the
  response. Anything older is invisible to this fetch and is left alone.

## Talking to GitHub

`services/githubService.js` wraps Octokit with the behaviour Octokit does not provide:

| Concern | Handling |
| --- | --- |
| Timeouts | `AbortController`, 30 s per request |
| Proxy | `node-fetch` + `HttpsProxyAgent` when a proxy is configured |
| Retries | 3 attempts on 429, 5xx, network errors and *secondary* rate-limit 403s |
| Never retried | 401, 404, and permission 403s |
| `Retry-After` | Honoured, capped at 60 s so a hostile header cannot stall the sync |
| Rate limit | Headers recorded from successes *and* failures; pauses below 100 remaining |
| Pagination | 100/page, 500 ms between pages, stops on a short page, an empty page, a repeated page, or 200 pages |

> **Why not plain `fetch`?** `@octokit/request` 6.x resolves
> `requestOptions.request.fetch || globalThis.fetch || node-fetch`. On Node 18+ that
> means undici, which ignores the `agent` option entirely (it wants a `dispatcher`) and
> does not implement `timeout` at all. So `HTTP_PROXY` silently did nothing for the star
> sync and release fetches — only the axios calls in `routes/repos.js` honoured it — and
> no request ever timed out.

`config/proxy.js` additionally rewrites a loopback proxy URL to `host.docker.internal`
when running inside a container, because `http_proxy=http://127.0.0.1:7890` forwarded
from your shell into a container points at the *container's* loopback and fails with
`ECONNREFUSED`. If the gateway is not mapped it warns with the fix instead of failing
silently.

## README proxy and cache

`GET /api/repos/:owner/:repo/readme` fetches the raw README with the user's own token
and returns `text/plain`. The frontend renders it — the backend never converts markdown.

The cache is an in-process LRU: 1000 entries, 6-hour TTL, keyed `userId:owner/repo` so
one user's private README can never be served to another. On an upstream failure the
handler falls back to a **stale** entry if it has one, which keeps the modal useful
during a GitHub outage. `?refresh=true` bypasses the cache.

Purging unfollowed repositories drops that user's cache entries by key prefix.

## Schedulers

Two timers start in-process, `SCHEDULER_STARTUP_DELAY_MS` (default 30 s) after boot so a
restart loop cannot hammer GitHub:

| Ticker | Default interval | What it does |
| --- | --- | --- |
| Star sync | 1 hour | Syncs users whose last *completed* sync is over 24 h old |
| Version tracking | 6 hours | Refreshes releases for repos tagged `version-tracking` |

Both skip users with no access token and users with a sync already in progress, and both
guard against overlapping runs with a simple in-flight flag.

The star ticker backs off after failures: 30 minutes normally, 24 hours when the last
error looks like an auth failure (`bad credentials`, `requires authentication`, `401`),
so a revoked token does not generate hourly noise forever.

The version ticker processes at most 50 repositories per user per tick, oldest-fetched
first, so a user with hundreds of tracked repos still makes progress each tick without
spending the whole rate limit at once. Its freshness window is deliberately 90 % of the
tick interval: passing the interval itself meant a repo fetched on tick N was 1 ms too
fresh on tick N+1, so tracking only ran on every *other* tick.

`startSchedulers()` returns a `stop()` handle, called from the `SIGTERM`/`SIGINT`
shutdown path along with closing the HTTP server and the database pool. `tini` in the
Docker image is what makes those signals arrive at all.

## Invariants worth protecting

If you change the backend, these are the ones that cost users data when they break.
The first two have dedicated regression tests in `backend/test/repo-isolation.test.js`,
both verified by re-introducing the bug and confirming the suite goes red.

1. **A repository row belongs to exactly one user.** Uniqueness is `(UserId, githubId)`,
   and every upsert says so explicitly.
2. **A sync never deletes repositories**, and never treats an empty GitHub response as
   "un-star everything".
3. **A sync never overwrites user-owned columns** — tags, notes, `currentlyUsedVersion`.
4. **Every read of a repository is ownership-checked.** Either scope the query
   (`findOne({ where: { id, UserId: req.user.id } })`, as the routes do) or check
   `repo.UserId !== user.id` immediately after loading it, as `ReleaseService` does.
   A bare `findByPk(id)` with no following check is a cross-user data leak.
5. **The access token never reaches the client.**
6. **Unknown `/api` paths return JSON, not HTML.**
