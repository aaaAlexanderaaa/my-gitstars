---
doc_type: guide
status: current
authority: guidance
---

# Engineering Discipline Adoption Record

`my-gitstars` adopted the `template-project` engineering discipline baseline on **2026-11-24** (starting at repo commit `1f405f7`). The authoritative discipline release version, upstream commit (`8abc2bd59bba8743b6c9271fc06808857827c13a`), maturity stage (`usable`), collaboration mode (`interactive`), adoption stage (`observed`), source roots, and file budgets live in [docs-policy.toml](../docs-policy.toml).

## 1. Repository Inventory at Adoption

Measured on 2026-11-24 against commit `1f405f7` (clean working tree, Path B onboarding for an existing codebase):

- **Codebase size**: 12,110 lines across 113 files within configured `source_roots` (14,380 lines across 136 files repo-wide including migrations and tests; web UI and CSS present).
- **Stack**: Express + Sequelize + PostgreSQL backend (`backend/src/`), Next.js 14 static export frontend (`new_frontend/`), single-container Docker deployment.
- **Initial adoption stage**: `observed` — structural gaps and legacy file-size debt are recorded as non-blocking advisories while existing CI and business behavior remain untouched.
- **Helper scripts**: `template-project` Python checker scripts are not vendored into this Node.js/TypeScript repository during initial adoption; validation runs externally against this repository root when syncing or auditing.

## 2. Synchronization Matrix Against `template-project` (2026.11.2)

| Discipline area | Status | Concrete repository facts and local owner |
|---|---|---|
| **Priority order & three-perspective judgment** | Adopted now | Written into [AGENTS.md](../AGENTS.md) for the `usable` maturity stage and `interactive` collaboration mode. |
| **Plain, direct English & information organization** | Already covered locally + codified | Existing [README.md](../README.md) and `docs/*.md` already use clear English organized by reader task; reinforced as a rule in [AGENTS.md](../AGENTS.md). |
| **Five-part architecture & single source of state** | Adopted now | Added top-level [ARCHITECTURE.md](../ARCHITECTURE.md) with Mermaid runtime flow, forbidden couplings, and state owners, linking back to [docs/architecture.md](architecture.md) and [docs/api.md](api.md). |
| **Module specs (`docs/specs/`) & `# Role:` headers** | Deferred (in `observed` stage) | Deferred until upcoming backend API modules are added; new modules should declare clear responsibilities before switching to `scoped_enforcement`. |
| **Verbatim sources (`docs/sources.toml`) & ADRs** | Deferred | Not created yet; add `docs/sources.toml` and `docs/decisions/ADR-*.md` when cross-module design trade-offs (such as auth token scoping or non-starred repo tracking) settle. |
| **File budgets & catch-all directory ban** | Adopted now (advisory on legacy) | Budgets defined in [docs-policy.toml](../docs-policy.toml); legacy oversized files and `backend/test/helpers/` are registered below and frozen against growth. |
| **Frontend accessibility & semantic styling** | Partially covered locally + codified | Semantic CSS custom properties (`new_frontend/app/globals.css`, 112 lines), strict TypeScript (`ignoreBuildErrors: false`), and sanitized Markdown ([docs/frontend.md](frontend.md)) already exist; WCAG 2.2 AA contrast (`4.5:1` text, `3:1` control borders), keyboard/focus, and state checks codified in [AGENTS.md](../AGENTS.md). |
| **Real-path verification & CI gates** | Already covered locally + codified | [.github/workflows/docker-image.yml](../.github/workflows/docker-image.yml) already runs frontend typecheck/lint/test/build, real PostgreSQL migrations + rollbacks, 0-skip backend tests, HTTP smoke checks, and unprivileged Docker assertions; mirrored in [AGENTS.md](../AGENTS.md). |
| **Single-owner facts (2026.11.2 rules)** | Adopted now | Version, adoption stage, and budgets live only in [docs-policy.toml](../docs-policy.toml); roadmap milestones and task states live only in [docs/work.toml](work.toml). |

## 3. Registered Legacy Debt Baseline

Measured on 2026-11-24 against the source and style line budgets in [docs-policy.toml](../docs-policy.toml):

| Path | Observed metric | Classification | Handling rule |
|---|---|---|---|
| `new_frontend/app/dashboard/page.tsx` | 903 lines | Oversized source file | Keep stable; place new dashboard features in dedicated components under `new_frontend/components/` and pure logic under `new_frontend/lib/`. |
| `backend/src/routes/repos.js` | 729 lines | Oversized source file | Keep stable; mount new API endpoints (such as read-only release summaries or programmatic tracking) in dedicated route/service modules. |
| `new_frontend/components/ui/sidebar.tsx` | 726 lines | Generated UI primitive | Upstream shadcn/ui primitive; treat as vendored primitive and wrap externally rather than editing inline. |
| `backend/test/helpers/` (`db.js`) | Catch-all directory name | Directory naming debt | Keep existing imports working until touched; create new test helpers under capability-named directories (e.g., `backend/test/fixtures/`). |

`new_frontend/app/globals.css` measures 112 lines and sits within the style budget.

## 4. Next Planned Milestones & Upgrade Path

Active milestones and task states live in [docs/work.toml](work.toml). The next development stage focuses on four open-source product improvements, implemented in dedicated modules and separate development branches:

1. **Optional Bearer API token authentication** (`M-AUTO-01`): Disabled by default, constant-time token comparison (`crypto.timingSafeEqual`), explicit permission boundaries for automation clients.
2. **Programmatic `owner/repo` version tracking** (`M-AUTO-01`): Track releases for arbitrary repositories via Sequelize migrations without requiring or polluting the user's GitHub stars list.
3. **Unified read-only release summary JSON endpoint** (`M-AUTO-01`): Machine-readable endpoint summarizing tracked versions, latest published releases, update availability, and fetch freshness.
4. **Pinned container base images** (`M-OPS-01`): Replace bare `latest` tags with pinned version tags in `Dockerfile` and `docker-compose.yml` while preserving non-root execution and `tini` signal forwarding.

### Advancing Beyond `observed`

Move `[adoption].stage` from `observed` to `scoped_enforcement` in [docs-policy.toml](../docs-policy.toml) once formal module specs exist under `docs/specs/` for newly added backend API modules and `managed_paths` targets those modules without blocking untouched legacy files.
