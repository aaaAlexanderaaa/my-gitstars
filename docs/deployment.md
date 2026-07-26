# Deployment

The production artifact is a single container image: Express serving both the API and
the pre-built frontend from one origin. You need that container and a PostgreSQL.

- [The image](#the-image)
- [Docker Compose](#docker-compose)
- [Behind a reverse proxy](#behind-a-reverse-proxy)
- [Health checks](#health-checks)
- [Backups](#backups)
- [Upgrading](#upgrading)
- [Running without Docker](#running-without-docker)
- [Operational notes](#operational-notes)

## The image

Published to GHCR on every push to `main` or `release`, and on `v*.*.*` tags, for
`linux/amd64` and `linux/arm64`, with build provenance attestation:

```bash
docker pull ghcr.io/aaaalexanderaaa/my-gitstars:latest
```

Tags: `latest` (default branch), `main`, `2.1.0` / `2.1` (from semver tags), and
`sha-<short>`.

The [Dockerfile](../Dockerfile) is three stages — build the frontend, install backend
production dependencies, assemble a runtime — so build tooling never ships. What ends up
in the image:

- The Next.js export at `/app/frontend/build`
- `backend/` with production `node_modules`
- `tini` as PID 1, so `SIGTERM` from `docker stop` actually reaches Node and the
  graceful-shutdown handlers run
- An unprivileged `node` user (CI asserts the image does not run as root)

Start-up is `wait-db.js && sequelize-cli db:migrate && node src/index.js`: it blocks
until PostgreSQL accepts connections (up to `DB_WAIT_TIMEOUT_MS`), applies migrations,
then execs the server. **Migrations run automatically** — there is no separate step.

Production runs `node`, not `nodemon`: nodemon survives a crashed app, which hides
failures from Docker's restart policy and health check.

## Docker Compose

The bundled [docker-compose.yml](../docker-compose.yml) covers both shapes.

**With the bundled PostgreSQL** (`DB_HOST=db` in `.env`):

```bash
docker compose --profile local-db up -d --build
```

The database container keeps its data in the named volume `postgres_data` and publishes
`127.0.0.1:25432` — loopback only, so it is not exposed to your network.

**With your own PostgreSQL** — set `DB_HOST`/`DB_PORT` in `.env` and drop the profile:

```bash
docker compose up -d --build
```

Two things about how Compose is wired, in case you extend it:

- `env_file` passes the whole `.env` into the container, so a new setting does not need
  to be added to the `environment:` list as well.
- Entries in `environment:` are written as bare names (`GITHUB_CLIENT_ID`) rather than
  `FOO=${FOO:-}`. The latter injects an *empty* value that overrides `env_file`, which
  silently blanks credentials supplied via `.env`.

## Behind a reverse proxy

Set `APP_URL` to the public origin, register `<APP_URL>/auth/github/callback` on your
GitHub OAuth app, and forward the standard headers. The app sets `trust proxy: 1`, so
`X-Forwarded-Proto` decides whether the session cookie is treated as secure.

**nginx:**

```nginx
server {
    listen 443 ssl;
    server_name stars.example.com;

    # certificates omitted

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**Caddy:**

```
stars.example.com {
    reverse_proxy 127.0.0.1:4000
}
```

Corresponding `.env`:

```bash
NODE_ENV=production
APP_URL=https://stars.example.com
```

`COOKIE_SECURE` is then derived as `true`. If sign-in loops back to the landing page,
that derivation is usually the thing to check — see
[Troubleshooting](troubleshooting.md#sign-in-succeeds-then-bounces-me-back-to-the-landing-page).

**There is no subpath support.** `APP_URL` must be a bare origin; serving the app under
`https://example.com/stars/` will not work.

**Do not put a second origin in front of it.** The frontend is served by the same
process as the API, so `CORS_ORIGINS` is only relevant if you deliberately split them.

## Health checks

`GET /api/health` returns `200` when the database answers and `503` when it does not.
Both the Dockerfile and Compose already define a health check against it (30 s interval,
40 s start period, 3 retries).

```bash
curl -fsS http://localhost:4000/api/health
```

```json
{ "status": "ok", "database": "ok", "frontend": "ok", "uptime": 3721 }
```

`"frontend": "missing"` means the exported build is not where the server expects it —
the API works, the UI does not.

For an external monitor, `status != "ok"` is the alert condition. It is a liveness *and*
dependency check, so a database outage will show up here.

## Backups

Everything worth keeping is in PostgreSQL: your tags, notes, version choices, and the
sessions table. Repository metadata is re-derivable from GitHub by syncing; the
hand-made data is not.

**Database dump** (bundled container):

```bash
docker compose exec db pg_dump -U postgres gitstars | gzip > gitstars-$(date +%F).sql.gz
```

Restore:

```bash
gunzip -c gitstars-2026-07-26.sql.gz | docker compose exec -T db psql -U postgres gitstars
```

**Application-level export**, as a second line of defence — human-readable, portable
between instances, and unaffected by schema changes:

```bash
curl -b "gitstars.sid=<value>" http://localhost:4000/api/export > gitstars-export.json
```

The dashboard's **Export** button does the same thing. Restore it with `POST /api/import`
(or the **Import** button) *after* a sync, since import only updates repositories that
already exist in your account.

## Upgrading

```bash
docker compose pull            # or: git pull && docker compose build
docker compose up -d
```

Migrations run at start-up, so no manual step is needed. Take a database dump first if
the release notes mention schema changes.

Rolling back to an older image is only safe if no migration ran in between —
`sequelize-cli` will not undo one for you on start-up. Check with:

```bash
docker compose exec app npx sequelize-cli db:migrate:status
```

## Running without Docker

```bash
cd new_frontend && npm ci --legacy-peer-deps && npm run build
cd ../backend  && npm ci --omit=dev && npm run migrate && npm start
```

The backend finds the export at `new_frontend/out` automatically (override with
`FRONTEND_DIR`) and serves the whole app on `PORT`. Use a process supervisor — systemd,
pm2 — that restarts on exit and delivers `SIGTERM` on stop.

## Operational notes

**One process, background work included.** The schedulers run in-process. Two replicas
means two schedulers competing for the same rows and the same GitHub rate limit. The
advisory lock in the sync prevents duplicate syncs, but the design assumes a single
instance; scale up, not out.

**GitHub rate limits** are per user token (5000 requests/hour). A full sync of a
1000-star account is ~10 requests; release tracking is one request per tracked repository
per tick, capped at 50 per user per tick.

**Logs go to stdout** in plain text. `docker compose logs -f app`. Notable prefixes:
`[scheduler]`, `[sync]`, `[github-api]`, `[release-service]`, `[proxy]`.

**Resource use** is modest — the container idles at well under 200 MB. The dashboard
loads the entire repository list in one response, so a very large account makes the
initial page load the heaviest thing in the system.

**Sessions live in PostgreSQL**, so restarts do not log anyone out. Expired rows are
swept every 15 minutes.

**Changing `SESSION_SECRET` invalidates every session.** That is the emergency logout.
