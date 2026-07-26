# Development

- [Prerequisites](#prerequisites)
- [Running the two servers](#running-the-two-servers)
- [Project layout](#project-layout)
- [Commands](#commands)
- [Database and migrations](#database-and-migrations)
- [Tests](#tests)
- [Continuous integration](#continuous-integration)
- [Conventions](#conventions)

## Prerequisites

- Node.js 20+
- A reachable PostgreSQL (the bundled container is the easiest)
- A GitHub OAuth app — a **second one**, pointed at `http://localhost:3000`, is worth
  creating so you are not editing your production app's callback URL back and forth

## Running the two servers

In production, one process serves both the API and the pre-built frontend. In
development you run them separately so the frontend hot-reloads.

**Database first:**

```bash
docker compose --profile local-db up -d db    # publishes 127.0.0.1:25432
```

Then in `.env`:

```bash
DB_HOST=127.0.0.1
DB_PORT=25432
APP_URL=http://localhost:3000     # the dev server, not the API
```

**Terminal 1 — backend on :4000:**

```bash
cd backend
npm install
npm run migrate
npm run dev
```

**Terminal 2 — frontend on :3000:**

```bash
cd new_frontend
npm install --legacy-peer-deps
npm run dev
```

Open <http://localhost:3000>. The Next.js dev server proxies `/api/*` and `/auth/*` to
`http://localhost:4000` (override with `NEXT_PUBLIC_API_URL`), so the browser only ever
talks to one origin and the session cookie works normally.

> `--legacy-peer-deps` is required: the shadcn/ui component set pins Radix versions that
> npm's strict peer resolution rejects. The Dockerfile and CI use the same flag.

**OAuth in development.** Because `APP_URL` drives the callback URL, register
`http://localhost:3000/auth/github/callback` on the OAuth app you use for development.
The backend logs the callback URL it will send at boot — if it does not match GitHub's
registration exactly, sign-in fails.

**Skipping the dev server.** If you build the frontend once
(`cd new_frontend && npm run build`), the backend serves `new_frontend/out` directly, so
`cd backend && npm start` gives you the whole app on `:4000` with no Docker and no
second process. No hot reload, but it is the closest thing to production.

## Project layout

```
backend/
  src/
    index.js              boot: env checks, APP_URL validation, graceful shutdown
    config/
      env.js              .env loading, required-variable check
      database.js         Sequelize connection settings for every NODE_ENV
      middleware.js       security headers, CORS allow-list, session store, passport
      passport.js         GitHub strategy, user upsert, session (de)serialisation
      routes.js           route order, static serving, SPA fallback, error handler
      proxy.js            outbound proxy agent + container loopback rewriting
    routes/               auth.js, sync.js, repos.js, releases.js
    services/
      githubService.js    Octokit wrapper: retries, rate limits, pagination
      syncService.js      star sync, advisory locking, unfollow reconciliation
      releaseService.js   release fetch/store/prune, version selection
      schedulerService.js the two background tickers
    models/index.js       Sequelize model definitions and associations
    lib/tags.js           tag validation and normalisation
    middleware/auth.js    ensureAuth
  migrations/             sequelize-cli migrations, applied at container start
  test/                   node --test suites
  scripts/smoke-http.js   full HTTP surface check with the database stubbed
  wait-db.js              blocks container start-up until Postgres accepts connections

new_frontend/
  app/                    App Router: landing page, dashboard, layout, globals.css
  components/             feature components + components/ui (shadcn/ui primitives)
  lib/                    api client, types, filtering, boolean filter parser
  hooks/                  use-toast, use-mobile
  scripts/                node --test suites for the lib/ logic

Dockerfile                three-stage build → one runtime image
docker-compose.yml        app + optional bundled postgres (profile: local-db)
```

See [Frontend](frontend.md) for how the client is put together, and
[Architecture](architecture.md) for the backend's moving parts.

## Commands

| Command | What it does |
| --- | --- |
| `cd backend && npm run dev` | Backend with nodemon reload |
| `cd backend && npm start` | Backend, no reload (what production runs) |
| `cd backend && npm run check` | Parse every source file — a fast syntax gate |
| `cd backend && npm run migrate` | Apply migrations |
| `cd backend && npm run migrate:status` | Show migration state |
| `cd backend && npm run migrate:undo` | Roll the last migration back |
| `cd backend && npm test` | Unit + integration + HTTP smoke tests |
| `cd new_frontend && npm run dev` | Frontend dev server with API proxying |
| `cd new_frontend && npm run build` | Static export into `new_frontend/out` |
| `cd new_frontend && npm run typecheck` | `tsc --noEmit` |
| `cd new_frontend && npm run lint` | ESLint |
| `cd new_frontend && npm test` | Frontend logic tests |

## Database and migrations

Migrations are plain `sequelize-cli` files. Create one by hand in `backend/migrations/`
following the existing naming (`YYYYMMDDNNNNNN-what-it-does.js`) and always write a
working `down` — CI rolls the last two migrations back and re-applies them, so a broken
`down` fails the build.

```bash
cd backend
DB_HOST=127.0.0.1 DB_PORT=25432 npm run migrate
DB_HOST=127.0.0.1 DB_PORT=25432 npm run migrate:status
```

Model definitions in `src/models/index.js` are **not** synced automatically — the schema
is whatever the migrations produced. Change both, in the same commit.

A few schema decisions carry regression tests; read
[the invariants](architecture.md#invariants-worth-protecting) before touching the
`Repos` uniqueness constraint or the sync's delete behaviour.

## Tests

No test framework is installed. Everything is `node --test`, and nothing is mocked
beyond the network.

```bash
cd backend      && npm test    # 61 unit/integration tests + 34 HTTP smoke checks
cd new_frontend && npm test    # 33 logic tests
```

**What each suite covers:**

| Suite | Covers |
| --- | --- |
| `backend/test/github-service.test.js` | Retry policy, rate-limit handling, pagination termination |
| `backend/test/repo-isolation.test.js` | Per-user repository scoping, the empty-star-list guard |
| `backend/test/release-service.test.js` | Version selection, prerelease fallback, pruning, error backoff |
| `backend/test/tags.test.js` | Tag validation and normalisation |
| `backend/test/proxy.test.js` | Proxy resolution and container loopback rewriting |
| `backend/scripts/smoke-http.js` | Status codes, content types, auth guards, CORS, SPA routing, OAuth redirect — with the database stubbed |
| `new_frontend/scripts/test-filter-expression.mjs` | The boolean expression tokenizer and parser |
| `new_frontend/scripts/test-filter-repositories.mjs` | Filtering, quick filters, sorting, formatting helpers |

**The database-backed tests self-skip** when no PostgreSQL is reachable, so `npm test`
works anywhere. They assert on behaviour that only exists in PostgreSQL — `ON CONFLICT`
targets, array operators, and the fact that Sequelize silently drops an empty
`NOT IN ()` — so faking them would defeat the point. Point them at a real database to
run them for real:

```bash
docker compose --profile local-db up -d db
cd backend
DB_HOST=127.0.0.1 DB_PORT=25432 npm run migrate
DB_HOST=127.0.0.1 DB_PORT=25432 npm test
```

With a database present the backend suite reports 61 tests and 0 skips. If you see
skips, the tests you most want are the ones that did not run.

These suites truncate shared tables, so `test:unit` runs with `--test-concurrency=1`.
Don't point them at a database you care about.

## Continuous integration

`.github/workflows/docker-image.yml` runs three jobs on every push and pull request to
`main`:

**Frontend** — `npm ci --legacy-peer-deps`, then typecheck, lint, test, build.
Type errors fail the build; `ignoreBuildErrors` is deliberately off (see
[Frontend](frontend.md#why-type-checking-is-on)).

**Backend** — against a real `postgres:16-alpine` service container: parse check,
migrate, roll the last two migrations back and re-apply, unit tests, smoke tests.
CI **fails if the database-backed tests skip**, because a silent skip would stop
guarding the two bugs that could delete a user's repositories.

**Docker** — builds the image, then asserts that the exported frontend actually landed
in it (`/app/frontend/build/index.html` and `dashboard/index.html`) and that the image
does not run as root.

`.github/workflows/docker-image-publish.yml` pushes multi-arch images to GHCR on pushes
to `main`/`release` and on `v*.*.*` tags, with build provenance attestation.

## Conventions

**Comments explain why, not what.** The codebase leans on this heavily — most non-obvious
lines carry a note about the failure mode that shaped them. Keep that up; a comment
saying `// increment the counter` is noise, one saying why the counter must be
incremented *before* the await is not.

**Errors are surfaced, not swallowed.** The frontend API client throws an `ApiError`
carrying the server's own message rather than silently falling back — the dashboard once
displayed hard-coded demo data when a request failed, which made bugs invisible.

**User data is never touched by automated processes.** Tags, notes and version choices
are only written by an explicit user action.

**Prefer a query to a mutable field.** "Last successful sync" is a `SyncStatus` lookup,
not a column that can drift.
