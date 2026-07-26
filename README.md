# my-gitstars

Self-hosted manager for your GitHub stars: tag them, filter them, read their READMEs,
keep private notes, and get told when a tool you actually use ships a new release.

## Features

- 🔐 GitHub OAuth sign-in
- ⭐ Syncs your starred repositories (manually or on a schedule)
- 🏷️ Custom tags, with bulk apply/remove and global rename/delete
- 🔍 Filter by tag, language and topic, plus boolean expressions like `(react OR vue) AND NOT deprecated`
- 📝 Per-repository markdown notes, included in search
- 📖 README preview with images and relative links resolved against the repo's real default branch
- 📦 Release tracking: pick the version you run and see when a newer one lands, with a copyable changelog
- 💾 Export/import your tags, notes and version choices as JSON
- 🌓 Light and dark themes
- 🔄 Live sync progress

## Tech stack

- **Frontend** — Next.js 14 (App Router, static export), TypeScript, Tailwind CSS, shadcn/ui, react-markdown
- **Backend** — Node.js 20, Express, Passport (GitHub), Sequelize, PostgreSQL
- **Infrastructure** — Docker, Docker Compose

The production image is a single container: Express serves the API *and* the exported
frontend from the same origin.

## Getting started

### Prerequisites

- Docker and Docker Compose (or Node.js 20+ and a PostgreSQL instance)
- A GitHub OAuth app

### 1. Create a GitHub OAuth app

At <https://github.com/settings/developers> → **New OAuth App**:

| Field | Value |
| --- | --- |
| Homepage URL | `http://localhost:4000` |
| Authorization callback URL | `http://localhost:4000/auth/github/callback` |

If you deploy somewhere else, use that origin instead — it has to match `APP_URL` exactly.

### 2. Configure

```bash
git clone https://github.com/aaaAlexanderaaa/my-gitstars
cd my-gitstars
cp .env.example .env
```

Fill in `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` and `SESSION_SECRET`
(`openssl rand -hex 32` generates a good secret).

### 3. Run

With the bundled PostgreSQL container:

```bash
docker compose --profile local-db up --build
```

With your own PostgreSQL (set `DB_HOST` / `DB_PORT` in `.env` first):

```bash
docker compose up --build
```

Migrations run automatically at container start. Then open <http://localhost:4000> and
press **Sync** to import your stars.

Health check: `curl http://localhost:4000/api/health`

## Development

Run the two servers separately so the frontend hot-reloads:

```bash
# terminal 1 - backend on :4000
cd backend && npm install && npm run migrate && npm run dev

# terminal 2 - frontend on :3000
cd new_frontend && npm install --legacy-peer-deps && npm run dev
```

The dev server proxies `/api/*` and `/auth/*` to `http://localhost:4000`
(override with `NEXT_PUBLIC_API_URL`). Set `APP_URL=http://localhost:3000` for the
backend and register `http://localhost:3000/auth/github/callback` as a callback URL on
your OAuth app, so GitHub returns you to the dev server.

The backend needs a reachable PostgreSQL. The quickest way is the bundled one:

```bash
docker compose --profile local-db up db     # publishes 127.0.0.1:25432
# then in .env: DB_HOST=127.0.0.1  DB_PORT=25432
```

Useful commands:

| Command | What it does |
| --- | --- |
| `cd backend && npm run dev` | Backend with reload |
| `cd backend && npm run migrate` | Apply migrations |
| `cd backend && npm run migrate:status` | Show migration state |
| `cd backend && npm run migrate:undo` | Roll the last migration back |
| `cd backend && npm test` | Backend unit + integration + HTTP smoke tests |
| `cd new_frontend && npm run dev` | Frontend dev server |
| `cd new_frontend && npm run build` | Static export into `new_frontend/out` |
| `cd new_frontend && npm run typecheck` | Type-check |
| `cd new_frontend && npm test` | Frontend logic tests |

If you build the frontend locally, the backend serves `new_frontend/out` directly, so
`cd backend && npm start` gives you the whole app on `:4000` without Docker.

### Tests

Nothing needs mocking beyond the network, and no test framework is installed — it is
all `node --test`.

```bash
cd backend      && npm test    # 61 unit/integration tests + 34 HTTP smoke checks
cd new_frontend && npm test    # 33 logic tests
```

The backend's data-layer tests assert on behaviour that only exists in PostgreSQL —
`ON CONFLICT` targets, array operators, and the fact that Sequelize silently drops an
empty `NOT IN ()`. They **self-skip** when no database is reachable, so `npm test`
works anywhere; point them at one to run them for real:

```bash
docker compose --profile local-db up -d db
cd backend && DB_HOST=127.0.0.1 DB_PORT=25432 npm run migrate && \
              DB_HOST=127.0.0.1 DB_PORT=25432 npm test
```

CI runs them against a PostgreSQL service container and **fails if they skip**, since a
silent skip would stop guarding the two bugs that could delete a user's repositories:
cross-user row theft via a global unique `githubId`, and the sync deleting every
repository when GitHub returns an empty star list. `test/repo-isolation.test.js` exists
specifically to keep those from coming back — both were verified by re-introducing them
and confirming the suite goes red.

These suites truncate shared tables, so `test:unit` runs with `--test-concurrency=1`.

## Configuration

Every setting is an environment variable, and all of them are documented in
[`.env.example`](.env.example). The ones worth knowing about:

| Variable | Purpose |
| --- | --- |
| `APP_URL` | Public origin. Drives the OAuth callback URL, the CORS allow-list and the cookie `Secure` flag. |
| `SESSION_SECRET` | Signs the session cookie. Sessions live in PostgreSQL, so they survive restarts. |
| `GITHUB_OAUTH_SCOPE` | Defaults to `read:user,user:email,repo`. Narrow to `public_repo` if you never star private repos. |
| `HTTP_PROXY` / `HTTPS_PROXY` | Route GitHub traffic through a proxy. |
| `VERSION_TRACKING_TAG` | Repos carrying this custom tag (default `version-tracking`) get their releases refreshed on a schedule. |
| `CORS_ORIGINS` | Only needed if the frontend is served from a different origin. |

### Release tracking

Add the `version-tracking` tag to a repository and the scheduler keeps its releases
fresh. Open a repository → **Changelog** to pick the version you run; anything newer
then shows as an update, and **Copy changelog** puts every release between your version
and the latest one on your clipboard.

### Keyboard shortcuts

| Key | Action |
| --- | --- |
| `/` or `⌘`/`Ctrl` + `K` | Focus search |
| `Enter` in a tag box | Save the tag |
| `Esc` | Cancel tag editing |

## How your data is handled

- Un-starring a repository on GitHub does **not** delete its row: it is marked
  unstarred so your tags and notes survive. Find them with the **Unstarred** quick
  filter, or delete them for good with the trash button in the header.
- If GitHub returns an empty star list, the sync leaves your existing list alone rather
  than treating it as "you un-starred everything".
- `GET /api/export` gives you every hand-made piece of data (tags, notes, version
  choices) as JSON; `POST /api/import` merges it back.

## API

All endpoints require an authenticated session cookie.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness, plus database and frontend status |
| `GET` | `/api/repos` | Repositories (`includeUnfollowed`, `onlyUnfollowed`, `tags`, `sort`, `order`, `updateAvailable`, `archived`, `fork`) |
| `GET` | `/api/stats` | Aggregate counts |
| `POST` | `/api/sync` | Start a star sync |
| `GET` | `/api/sync/status` | Progress of the latest sync |
| `GET` | `/api/tags/counts` | Tag, language and topic counts |
| `POST` | `/api/repos/:id/tags` | Add tags (or remove them with `action: "delete"`) |
| `POST` | `/api/repos/bulk-tags` | Apply or remove one tag across many repositories |
| `PATCH` | `/api/tags/:tag` | Rename a tag everywhere |
| `DELETE` | `/api/tags/:tag` | Remove a tag everywhere |
| `PUT` | `/api/repos/:id/notes` | Save a note |
| `GET` | `/api/repos/:owner/:repo/readme` | README (proxied and cached) |
| `GET` | `/api/releases/repo/:id` | Releases for a repository |
| `PATCH` | `/api/releases/repo/:id/version` | Set the version you run |
| `GET` | `/api/export`, `POST` `/api/import` | Backup and restore |
| `DELETE` | `/api/repos/unfollowed` | Permanently delete unstarred repositories |

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

CI type-checks and lints the frontend, parses the backend and builds the Docker image,
so run `npx tsc --noEmit` and `npm run lint` in `new_frontend/` before pushing.

## License

Apache License 2.0 — see [LICENSE](LICENSE).

## Acknowledgments

- [GitHub REST API](https://docs.github.com/en/rest)
- [shadcn/ui](https://ui.shadcn.com/) and [Radix UI](https://www.radix-ui.com/)
- [react-markdown](https://github.com/remarkjs/react-markdown)
