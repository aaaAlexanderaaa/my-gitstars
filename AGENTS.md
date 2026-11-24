# Repository Working Agreement

`my-gitstars` is a self-hosted GitHub stars manager and release tracker served by one Express backend, PostgreSQL, and a statically exported Next.js frontend. This repository adopts `template-project` (2026.11.2 baseline; authoritative `discipline_version`, `[adoption].stage`, `[project].default_stage`, and line budgets live in [docs-policy.toml](docs-policy.toml), currently starting at `observed` stage; see [docs/discipline-adoption.md](docs/discipline-adoption.md)).

## 1. Priority Order

1. **Data safety and the requested outcome**: Protect user stars, tags, notes, version choices, and credentials, and deliver working behavior.
2. **Shared vocabulary and single source of truth**: Keep one authoritative owner for every persisted schema, API shape, config setting, and doc fact.
3. **Module boundaries and plain prose**: Keep modules focused, put reusable frontend logic in `new_frontend/lib/`, and use semantic theme tokens in `new_frontend/app/globals.css`.
4. **Real-path verification**: Run actual checks against PostgreSQL, HTTP endpoints, and container builds matched to the `usable` stage and `interactive` mode.
5. **Documentation and work-queue sync**: Update [docs/work.toml](docs/work.toml), [ARCHITECTURE.md](ARCHITECTURE.md), [docs/api.md](docs/api.md), or [docs/configuration.md](docs/configuration.md) when behavior changes.

## 2. Three-Perspective Judgment Before Coding

- **Executor**: Separate settled invariants (below and in [docs/architecture.md](docs/architecture.md#invariants-worth-protecting)) from open product choices. Follow settled rules; challenge them only with concrete evidence.
- **Collaborator**: Match ceremony to stability. Keep early exploration small; once an endpoint or schema settles, record its contract in `docs/api.md` and `ARCHITECTURE.md`.
- **Senior Architect**: Target the `usable` maturity stage. Guard persisted user data, backward-compatible migrations, and clean module seams on every change.

## 3. Language, Architecture & Single Source of State

- **Plain, direct English**: In docs, code comments, error messages, and UI copy, state what an object is, how it works, and what problem it solves. Avoid coined buzzwords, stacked defensive disclaimers, and raw internal enum strings in user-facing text. Comments explain *why* (especially failure modes), not *what*.
- **Five-part architecture entry**: Read [ARCHITECTURE.md](ARCHITECTURE.md) for system scope, end-to-end runtime flow, bounded subsystems, state owners, and verification entrypoints; read [docs/architecture.md](docs/architecture.md) for backend internals and [docs/frontend.md](docs/frontend.md) for client details.
- **Single source of state**: PostgreSQL managed exclusively via Sequelize migrations (`backend/migrations/`, mirrored in `backend/src/models/index.js`) is the sole persistent source of truth. Express API payloads and Next.js client state derive from it; prefer queries (such as latest `SyncStatus`) over parallel mutable columns, and keep shared frontend types in `new_frontend/lib/types.ts`.
- **Single-owner docs**: Policy, version, and line budgets live in [docs-policy.toml](docs-policy.toml); active milestones and task states live in [docs/work.toml](docs/work.toml); HTTP contracts live in [docs/api.md](docs/api.md); environment variables live in [.env.example](.env.example) and [docs/configuration.md](docs/configuration.md).
- **UI accessibility & styling**: When changing UI screens, meet WCAG 2.2 AA contrast (`4.5:1` text, `3:1` control borders), preserve keyboard navigation and visible focus, design loading/empty/error states, and use semantic theme classes rather than hard-coded colors.

## 4. File Budgets & Legacy Debt Register

Keep new code within the source and style line budgets in [docs-policy.toml](docs-policy.toml) and avoid new catch-all folders (`utils/`, `helpers/`, `common/`, `misc/`). Write new endpoints, services, and UI panels in focused modules rather than expanding legacy files:

| Legacy path | Observed size / issue | Rule while in `observed` stage |
|---|---|---|
| `new_frontend/app/dashboard/page.tsx` | 903 lines | Do not expand; extract new panels to `new_frontend/components/` and pure logic to `new_frontend/lib/`. |
| `backend/src/routes/repos.js` | 729 lines | Do not expand; put new API groups (such as release summaries or tracked-repo endpoints) in dedicated route and service modules. |
| `new_frontend/components/ui/sidebar.tsx` | 726 lines | Upstream generated shadcn/ui primitive; leave untouched and wrap externally if needed. |
| `backend/test/helpers/` | Catch-all directory name | Do not add new files here; place new test support under capability-named directories (e.g., `backend/test/fixtures/`). |

## 5. Security, Data & Runtime Invariants

- **GitHub OAuth token isolation**: `User.accessToken` stays in PostgreSQL and backend services only; `/auth/user` serializes a fixed field whitelist (`publicUser` in `backend/src/routes/auth.js`).
- **Optional Bearer API tokens**: Any machine-client Bearer token auth must be disabled by default, compare tokens in constant time (`crypto.timingSafeEqual`), and enforce explicit ownership and read/write scope boundaries.
- **Per-user repository scoping & non-destructive sync**: Uniqueness is `(UserId, githubId)` with explicit `conflictFields`; every repository read verifies `UserId`. Sync marks unstarred rows `is_followed = false` rather than deleting, skips unfollow sweeps on an empty GitHub response, and never overwrites `tags`, `notes`, or `currentlyUsedVersion`.
- **Database migrations**: Every schema change ships in `backend/migrations/` with a working `down()` rollback, preserves existing starred data cleanly, and updates `backend/src/models/index.js` in the same commit.
- **Pinned container images**: Base and service images in `Dockerfile` and `docker-compose.yml` must use pinned version tags rather than bare `latest`; keep the runtime container unprivileged (`USER node`) with `tini` signal forwarding.
- **Client safety**: Keep `rehype-sanitize` (without `style`) in `new_frontend/components/markdown.tsx`, and keep Next.js `ignoreBuildErrors` and `ignoreDuringBuilds` set to `false`.

## 6. Direct Prohibitions Against Corner-Cutting

- **No mocked-only validation on PostgreSQL paths**: Data-layer tests exist to verify real PostgreSQL `ON CONFLICT`, array operators, and empty `NOT IN ()` handling; never treat `# SKIP` as passing.
- **No silent error swallowing or fake fallback data**: Surface backend errors via `ApiError` in `new_frontend/lib/api.ts` and record sync/release fetch failures in their status columns.
- **No unapproved breaking changes**: Keep new auth or tracking features opt-in and backward-compatible with existing starred data unless the owner approves a breaking change.
- **Finish authorized tasks cleanly**: Complete implementation, documentation sync, and verification end-to-end unless blocked on a real product decision.

## 7. Real-Path Verification Gates

Verify against real execution paths before marking work complete (details in [docs/development.md](docs/development.md)):

```bash
# Frontend (typecheck, lint, logic tests, static export)
cd new_frontend && npm run typecheck && npm run lint && npm test && npm run build

# Backend syntax, migrations, and real PostgreSQL tests (0 skipped required)
docker compose --profile local-db up -d db
cd backend && npm run check
DB_HOST=127.0.0.1 DB_PORT=25432 npm run migrate
DB_HOST=127.0.0.1 DB_PORT=25432 npm test
```

- When changing `backend/migrations/`, also verify rollback and re-apply (`npm run migrate:undo && npm run migrate`).
- Do not accept `# SKIP` in `backend` tests: skipped tests mean PostgreSQL was unreachable and repository-isolation guards did not run. On a development workstation without a local Docker or PostgreSQL runtime, run syntax, unit, and frontend checks locally and run the PostgreSQL migration/test suite and `docker compose --profile local-db up --build` smoke check against a remote Docker test host or CI (`DB_HOST=...`) rather than marking DB tests unverified.
- When changing routes, auth, build setup, or container files, run an end-to-end container smoke check (`docker compose --profile local-db up --build`) and verify `GET /api/health` returns `database: "ok"` and `frontend: "ok"` alongside real auth/route responses.
- In `interactive` mode, skip automatic multi-subagent reviews on routine edits; run a fresh-context independent review before irreversible migrations, auth/token boundaries, or when owner sign-off is needed.
