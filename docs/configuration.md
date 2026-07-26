# Configuration

Every setting is an environment variable. [`.env.example`](../.env.example) is the
canonical list; this page explains what each one actually changes and where it bites.

Values are read from, in order: the process environment, `./.env` (the working
directory), and `<repo>/.env`. Docker Compose passes the whole `.env` file into the
container via `env_file`, so adding a new setting there does not require touching
`docker-compose.yml`.

- [Required](#required)
- [App](#app)
- [Database](#database)
- [GitHub OAuth](#github-oauth)
- [Outbound proxy](#outbound-proxy)
- [Scheduler](#scheduler)
- [Frontend build](#frontend-build)
- [Worked examples](#worked-examples)

## Required

The process refuses to start without these three:

| Variable | Notes |
| --- | --- |
| `GITHUB_CLIENT_ID` | From your GitHub OAuth app |
| `GITHUB_CLIENT_SECRET` | From your GitHub OAuth app |
| `SESSION_SECRET` | Signs the session cookie. `openssl rand -hex 32`. Changing it logs everyone out. |

## App

| Variable | Default | What it does |
| --- | --- | --- |
| `NODE_ENV` | `production` | `production` hides error details from API responses and disables the localhost CORS entries |
| `PORT` | `4000` | Port inside the container |
| `APP_PORT` | `4000` | Host port Compose publishes |
| `APP_URL` | `http://localhost:<PORT>` | **The one people get wrong.** See below. |
| `COOKIE_SECURE` | derived | Force the `Secure` flag on the session cookie |
| `CORS_ORIGINS` | `APP_URL` | Comma-separated extra origins allowed to call the API with credentials |

### `APP_URL`

This single value drives three things:

1. the OAuth callback URL registered with GitHub (`<APP_URL>/auth/github/callback`),
2. the CORS allow-list,
3. whether the session cookie gets the `Secure` flag.

It must be the origin you actually browse to — scheme, host, port, **no trailing slash
and no path**. A trailing slash produces `https://host//auth/github/callback`, which
GitHub treats as a different, unregistered redirect URI. The app normalises trailing
slashes and rejects anything that is not a bare `http(s)` origin at boot, then logs the
callback URL it will use:

```
OAuth callback URL: https://stars.example.com/auth/github/callback
```

If `APP_URL` is unset it defaults to `http://localhost:<PORT>` and warns, because a
wrong value fails later as an opaque GitHub error.

### `COOKIE_SECURE`

Auto-detected: true when `NODE_ENV=production` *and* `APP_URL` starts with `https://`.
Set it explicitly when the auto-detection is wrong:

- `COOKIE_SECURE=true` — TLS terminates at a reverse proxy and `APP_URL` is `https://`
  but you run `NODE_ENV=development`.
- `COOKIE_SECURE=false` — plain HTTP on a LAN with an `https://` `APP_URL`. A `Secure`
  cookie is never stored over plain HTTP, so login appears to succeed and then
  immediately bounces you back to the landing page.

The app trusts one proxy hop (`trust proxy: 1`), so `X-Forwarded-Proto` from your
reverse proxy is respected.

### `CORS_ORIGINS`

Only needed when the frontend is served from a *different* origin than the backend — a
setup the packaged image does not use. Setting it **replaces** the default list rather
than adding to it, so include your own origin if you set it at all.

## Database

| Variable | Default | What it does |
| --- | --- | --- |
| `POSTGRES_USER` | `postgres` | |
| `POSTGRES_PASSWORD` | `postgres` | **Change this** for anything reachable beyond localhost |
| `POSTGRES_DB` | `gitstars` | |
| `DB_HOST` | `db` | `db` = the bundled container; otherwise your server's host |
| `DB_PORT` | `5432` | |
| `DB_PUBLISH_PORT` | `25432` | Host port for the bundled Postgres, bound to `127.0.0.1` only |
| `DB_WAIT_TIMEOUT_MS` | `120000` (2 min) | How long container start-up waits for the database before giving up |
| `DB_WAIT_RETRY_MS` | `2000` | Delay between connection attempts while waiting |

`DB_HOST` and `DB_PORT` are also read in lowercase (`db_host`, `db_port`) as a fallback,
because deployment platforms disagree about casing.

All `NODE_ENV` values — `development`, `test`, `staging`, `production`, or a typo —
resolve to the same connection settings. Only `development` and `production` used to be
defined, so any other value produced an opaque
`Dialect needs to be explicitly supplied` at boot.

**Bundled Postgres:** keep `DB_HOST=db` and run Compose with `--profile local-db`.
**External Postgres:** point `DB_HOST`/`DB_PORT` at it and run Compose *without* the
profile. There is no `DATABASE_URL` support; use the discrete variables.

## GitHub OAuth

| Variable | Default | What it does |
| --- | --- | --- |
| `GITHUB_OAUTH_SCOPE` | `read:user,user:email,repo` | Scopes requested at sign-in |

`repo` is needed **only** to see stars on private repositories. If you never star
private repos, narrow it:

```bash
GITHUB_OAUTH_SCOPE=read:user,user:email,public_repo
```

Changing the scope requires existing users to sign in again — stored tokens keep the
scope they were issued with.

## Outbound proxy

| Variable | What it does |
| --- | --- |
| `HTTPS_PROXY` / `https_proxy` | Proxy for GitHub traffic. Wins over `HTTP_PROXY`. |
| `HTTP_PROXY` / `http_proxy` | Fallback |

Applies to both the Octokit client (star sync, releases) and the axios calls (README,
repo details). Leave unset for a direct connection.

**Inside a container, `127.0.0.1` is the container**, not your host. Because Compose
forwards `http_proxy` from your shell, `http_proxy=http://127.0.0.1:7890 docker compose
up` is a common way to make every GitHub request fail with `ECONNREFUSED`. The app
detects this: if `host.docker.internal` is mapped (docker-compose.yml maps it via
`extra_hosts`) it rewrites the URL and logs the substitution; otherwise it warns with
the fix. Set the proxy explicitly to silence it:

```bash
HTTPS_PROXY=http://host.docker.internal:7890
```

## Scheduler

| Variable | Default | What it does |
| --- | --- | --- |
| `SYNC_TICK_INTERVAL_MS` | `3600000` (1 h) | How often the star-sync ticker runs |
| `VERSION_TRACKING_TICK_INTERVAL_MS` | `21600000` (6 h) | How often releases are refreshed |
| `VERSION_TRACKING_TAG` | `version-tracking` | The custom tag that opts a repo into release tracking |
| `SYNC_FAILURE_BACKOFF_MS` | `1800000` (30 min) | Wait after a failed sync before retrying |
| `SYNC_AUTH_FAILURE_BACKOFF_MS` | `86400000` (24 h) | Wait after an *auth* failure — a revoked token should not retry hourly |
| `SCHEDULER_STARTUP_DELAY_MS` | `30000` (30 s) | Delay before the first tick after boot |
| `SYNC_STALE_AFTER_MS` | `1200000` (20 min) | A sync with no progress for this long is declared dead |

The tick interval is *how often the scheduler looks*, not how often a user is synced: a
user is only synced when their last completed sync is over 24 hours old. That threshold
is a constant, not a setting.

Any non-positive or unparseable value falls back to the default rather than disabling
the timer.

`SYNC_STALE_AFTER_MS` is a deadlock escape hatch. If the process dies mid-sync, the
`in_progress` row would otherwise block every future sync for that user; after this long
without a `progress` update it is marked failed and a new sync may start. Raise it if
you have a very large account on a slow connection.

## Frontend build

| Variable | Default | What it does |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | Backend the `next dev` server proxies `/api` and `/auth` to |

Development only. The exported production build makes same-origin relative requests, so
this value is not baked into it. `REACT_APP_API_URL` is accepted as a legacy fallback.

`FRONTEND_DIR` (backend-side) overrides where Express looks for the exported build. It
falls back to `frontend/build` (the path used inside the Docker image) and then
`new_frontend/out` (a local `npm run build`).

## Worked examples

**Local, everything bundled:**

```bash
APP_URL=http://localhost:4000
DB_HOST=db
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
SESSION_SECRET=...            # openssl rand -hex 32
```

```bash
docker compose --profile local-db up --build
```

**Behind a reverse proxy with TLS, external database:**

```bash
NODE_ENV=production
APP_URL=https://stars.example.com
APP_PORT=4000
DB_HOST=10.0.0.5
DB_PORT=5432
POSTGRES_USER=gitstars
POSTGRES_PASSWORD=<strong>
POSTGRES_DB=gitstars
GITHUB_OAUTH_SCOPE=read:user,user:email,public_repo
```

The GitHub OAuth app's callback URL must be
`https://stars.example.com/auth/github/callback`.

**Frontend dev server against a local backend:** see
[Development](development.md#running-the-two-servers).
