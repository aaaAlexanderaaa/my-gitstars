# Troubleshooting

Symptom → cause → fix, for the failures people actually hit. Start with the logs
(`docker compose logs -f app`) — the app is deliberately loud about the things that
usually go wrong.

- [Sign-in](#sign-in)
- [Database](#database)
- [Sync](#sync)
- [Release tracking](#release-tracking)
- [Network and proxies](#network-and-proxies)
- [The UI](#the-ui)
- [Build and tests](#build-and-tests)

## Sign-in

### `redirect_uri_mismatch` from GitHub

The callback URL the app sends does not match what the OAuth app has registered. The app
logs what it will use at boot:

```
OAuth callback URL: http://localhost:4000/auth/github/callback
```

Make that string exactly the **Authorization callback URL** on your OAuth app. Common
mismatches: `http` vs `https`, a missing or extra port, `localhost` vs `127.0.0.1`, and
a trailing slash on `APP_URL` (which produces a double slash — the app strips these, but
check what it logged).

### `Missing required environment variables: ...` at start-up

`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` and `SESSION_SECRET` have no defaults. If
they are set in `.env` but not reaching the container, check that you are not overriding
them with an empty value in `docker-compose.yml`'s `environment:` list — a bare
`GITHUB_CLIENT_ID` passes the value through, `GITHUB_CLIENT_ID=${GITHUB_CLIENT_ID:-}`
blanks it.

### `APP_URL must be an absolute http(s) origin with no path`

Exactly what it says. `https://stars.example.com` — no path, no trailing slash. This is
a hard failure at boot because a wrong value fails later as an opaque GitHub error
instead.

### Sign-in succeeds, then bounces me back to the landing page

The session cookie was not stored. Almost always the `Secure` flag: a `Secure` cookie is
never stored over plain HTTP.

| Situation | Fix |
| --- | --- |
| Plain HTTP but `APP_URL` is `https://` | `COOKIE_SECURE=false` |
| HTTPS at a reverse proxy, `NODE_ENV=development` | `COOKIE_SECURE=true` |
| Reverse proxy not forwarding scheme | Send `X-Forwarded-Proto` |

Also check that `APP_URL` matches the origin in your address bar — a cookie set for
`localhost` is not sent to `127.0.0.1`.

### Everyone got logged out after a restart

Expected only if `SESSION_SECRET` changed. Sessions are stored in PostgreSQL and survive
restarts otherwise; if they do not, check that the `Sessions` table exists and that the
app is not falling back to a different database.

### `401` on every API call from a script

There is no API token. Sign in through the browser, copy the `gitstars.sid` cookie, and
send it: `curl -b "gitstars.sid=<value>" ...`.

## Database

### `Could not reach the database at <host>:<port> within 120000ms`

Start-up waits for PostgreSQL and then gives up. Check:

- **Using the bundled container?** `DB_HOST` must be `db` and you must run Compose with
  `--profile local-db`. Without the profile the `db` service is not created at all.
- **Using your own?** `DB_HOST=127.0.0.1` inside a container means the *container*.
  Use `host.docker.internal` (Compose maps it) or the real host address.
- Cold volumes can take a while on first boot — raise `DB_WAIT_TIMEOUT_MS`.

### `Dialect needs to be explicitly supplied`

An old symptom from an unrecognised `NODE_ENV`. Current code resolves every environment
to the same settings, so if you see this you are running an outdated image — update.

### `/api/health` returns 503 with `"database": "unavailable"`

The server is up but cannot reach PostgreSQL: it died, its credentials changed, or its
connection limit is exhausted. `docker compose logs db`.

### Migrations failed on start-up

The container exits before serving. Read the error — usually a partially-applied
migration from an interrupted start. Inspect and fix explicitly:

```bash
docker compose run --rm app npx sequelize-cli db:migrate:status
```

## Sync

### "Sync" does nothing / `started: false`

A sync is already running for your account. Watch `GET /api/sync/status`. If it is stuck
`in_progress`, it will be declared dead after `SYNC_STALE_AFTER_MS` (20 minutes without
progress) and the next attempt will start normally. That timeout exists because a
process that dies mid-sync would otherwise block syncs forever.

### Sync completed but says "GitHub returned no starred repositories"

Working as designed. GitHub returned an empty list while your account has repositories on
record, so the sync **skipped** the unfollow sweep rather than marking everything
un-starred. It is nearly always a transient GitHub response — sync again in a few
minutes.

### Sync fails with `Bad credentials`

Your stored access token was revoked (you removed the OAuth app's authorization, or
GitHub expired it). Sign out and sign in again. The scheduler backs off for 24 hours
after an auth failure, so it will not retry hourly in the meantime — a manual sync after
signing back in is immediate.

### My private starred repositories are missing

`GITHUB_OAUTH_SCOPE` must include `repo`. If you narrowed it to `public_repo`, private
stars are invisible. Changing the scope requires signing in again — stored tokens keep
the scope they were issued with.

### A repository I un-starred is still listed

By design: the row is kept so your tags and notes survive. It is hidden from the default
view; find them with the **Unstarred** quick filter, and delete them permanently with the
trash button in the header (`DELETE /api/repos/unfollowed`).

### Sync is very slow

Expected: 100 repositories per page with a 500 ms pause between pages, plus retries. A
5000-star account is ~50 pages. The progress bar updates after every batch of 100.

## Release tracking

### A repository shows no releases

It may genuinely have none (GitHub *tags* are not releases). Otherwise check
`releasesFetchError` on the repository — it records why the last fetch failed. Failed
fetches retry after 30 minutes rather than being cached for a full day.

### Releases are not refreshing automatically

Only repositories carrying the `version-tracking` tag (or whatever `VERSION_TRACKING_TAG`
is set to) are refreshed on a schedule. Everything else refreshes when you open it and
its data is over 24 hours old. The scheduler also processes at most 50 tracked
repositories per user per tick.

### "Update available" is stuck on

The comparison is `currentlyUsedVersion !== latestVersion`. Open the repository →
**Changelog** and re-select the version you run, or select "Not using" to opt out of
update tracking for it. If `latestVersion` itself looks wrong, force a refresh with
`GET /api/releases/repo/:id?refresh=true`.

### A pre-release is showing as the latest version

Only when the repository has *no* stable release at all — the fallback is deliberate, so
projects that ship only pre-releases still report a version.

## Network and proxies

### Every GitHub request fails with `ECONNREFUSED` inside Docker

A proxy on `127.0.0.1` is your **host's** loopback; inside a container that address is
the container itself. Docker Compose forwards `http_proxy` from your shell, so
`http_proxy=http://127.0.0.1:7890 docker compose up` reliably produces this.

The app detects it and logs one of two lines — either that it rewrote the URL to
`host.docker.internal`, or that it could not. Fix it explicitly:

```bash
HTTPS_PROXY=http://host.docker.internal:7890
```

### The proxy works for READMEs but not for sync

That was an old bug: only the axios calls honoured the proxy, because Octokit on Node 18+
resolves to undici, which ignores the `agent` option. Both paths honour it now. If you
still see it, you are on an outdated image.

### GitHub rate limit exhausted

Limits are per user token (5000/hour). The client pauses when fewer than 100 requests
remain and bulk release fetching stops below 50. If you hit it, wait for the reset —
`x-ratelimit-reset` in the logged error — and consider raising
`VERSION_TRACKING_TICK_INTERVAL_MS` or tagging fewer repositories.

## The UI

### Blank page, or `Frontend build not found`

The exported frontend is not where the server expects it. In Docker this should never
happen (CI asserts the export is in the image) — check you are not mounting over
`/app/frontend`. Outside Docker, run `cd new_frontend && npm run build`, or point
`FRONTEND_DIR` at the export.

`/api/health` reports this as `"frontend": "missing"`.

### An API call returns HTML instead of JSON

A stale build. Unknown `/api` and `/auth` paths return JSON 404s; they used to fall
through to the SPA fallback and answer `200` with the landing page. Update.

### README images are broken

Images are resolved against the repository's real default branch, so this should be rare.
Genuinely broken images hide themselves rather than showing a broken-image icon. If a
README renders without its images entirely, the repository may reference them with paths
that only resolve on github.com.

### Text is invisible in dark mode

A component hard-coded a colour instead of using the semantic Tailwind names
(`bg-background`, `text-muted-foreground`, …). That is a bug — see
[Frontend → Theming](frontend.md#theming).

### A tag was rejected

Tags allow letters, digits, `_`, `.` and `-`, up to 50 characters, 100 per repository.
The rejection message says which rule was broken. Validation runs on the server, so the
same rules apply to imports.

## Build and tests

### `npm install` fails on peer dependencies

Use `npm install --legacy-peer-deps` in `new_frontend/`. The shadcn/ui component set pins
Radix versions that npm's strict peer resolution rejects. Docker and CI use the same
flag.

### Backend tests report skips

The database-backed tests self-skip when no PostgreSQL is reachable. That is fine
locally, but those are the tests guarding against repository loss, so run them for real
before shipping anything near the sync:

```bash
docker compose --profile local-db up -d db
cd backend
DB_HOST=127.0.0.1 DB_PORT=25432 npm run migrate
DB_HOST=127.0.0.1 DB_PORT=25432 npm test     # expect 61 tests, 0 skipped
```

CI fails if they skip.

### Tests pass locally but fail in CI

The suites truncate shared tables and must not run concurrently — `test:unit` passes
`--test-concurrency=1` for that reason. If you added a suite that touches the database,
make sure it goes through `test/helpers/db.js`.

### `docker compose up --build` builds nothing

Fixed: the `app` service defines both `build` and `image`. If you see this, you are on an
old checkout where `build` was commented out while `image` was pinned.
