# my-gitstars

Self-hosted manager for your GitHub stars: tag them, filter them, read their READMEs,
keep private notes, and get told when a tool you actually use ships a new release.

Your stars live in your own PostgreSQL. Nothing is sent anywhere except GitHub.

```
┌──────────────┐     OAuth + REST      ┌──────────┐
│  your browser│ ◄──────────────────►  │  GitHub  │
└──────┬───────┘                       └────▲─────┘
       │  session cookie                    │  stars, releases, READMEs
┌──────▼──────────────────────────────┐     │
│  my-gitstars (one container)        ├─────┘
│  Express API + exported Next.js UI  │
└──────┬──────────────────────────────┘
       │
┌──────▼──────┐
│ PostgreSQL  │  repos, tags, notes, releases, sessions
└─────────────┘
```

## Features

- 🔐 GitHub OAuth sign-in — no accounts, no passwords to manage
- ⭐ Syncs your starred repositories, manually or on a schedule
- 🏷️ Custom tags, with bulk apply/remove and global rename/delete
- 🔍 Filter by tag, language and topic, plus boolean expressions like
  `(react OR vue) AND NOT deprecated`
- 📝 Per-repository markdown notes, included in search
- 📖 README preview with images and relative links resolved against the repo's real
  default branch
- 📦 Release tracking: pick the version you run and see when a newer one lands, with a
  copyable changelog
- 💾 Export/import your tags, notes and version choices as JSON
- 🌓 Light and dark themes
- 🔄 Live sync progress

## Quick start

You need Docker, Docker Compose, and a GitHub OAuth app.

**1. Create a GitHub OAuth app** at <https://github.com/settings/developers> →
**New OAuth App**:

| Field | Value |
| --- | --- |
| Homepage URL | `http://localhost:4000` |
| Authorization callback URL | `http://localhost:4000/auth/github/callback` |

Deploying somewhere else? Use that origin instead — it has to match `APP_URL` exactly.

**2. Configure:**

```bash
git clone https://github.com/aaaAlexanderaaa/my-gitstars
cd my-gitstars
cp .env.example .env
```

Fill in `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` and `SESSION_SECRET`
(`openssl rand -hex 32` generates a good secret).

**3. Run**, with the bundled PostgreSQL container:

```bash
docker compose --profile local-db up --build
```

Or against your own PostgreSQL — set `DB_HOST` / `DB_PORT` in `.env` first, then drop
the profile:

```bash
docker compose up --build
```

Migrations run automatically at container start. Open <http://localhost:4000>, sign in,
and press **Sync** to import your stars.

```bash
curl http://localhost:4000/api/health   # {"status":"ok","database":"ok",...}
```

## Documentation

| Document | What's in it |
| --- | --- |
| [Configuration](docs/configuration.md) | Every environment variable, its default, and what it actually changes |
| [Deployment](docs/deployment.md) | Docker, reverse proxies and TLS, backups, upgrades, resource notes |
| [Development](docs/development.md) | Running the two servers locally, project layout, the test suites |
| [Architecture](docs/architecture.md) | How a request flows, the data model, sync and release-tracking pipelines |
| [Frontend](docs/frontend.md) | Next.js app structure, state, filtering, markdown rendering, theming |
| [API reference](docs/api.md) | Every endpoint, its parameters and its response shape |
| [Troubleshooting](docs/troubleshooting.md) | Symptom → cause → fix for the failures people actually hit |
| [Contributing](CONTRIBUTING.md) | Workflow, what CI checks, what a good change looks like |

## Tech stack

- **Frontend** — Next.js 14 (App Router, static export), TypeScript, Tailwind CSS,
  shadcn/ui, react-markdown
- **Backend** — Node.js 20, Express, Passport (GitHub), Sequelize, PostgreSQL
- **Infrastructure** — Docker, Docker Compose

The production image is a single container: Express serves the API *and* the exported
frontend from the same origin, so there is no CORS setup and no second process to run.

## How your data is handled

- Un-starring a repository on GitHub does **not** delete its row: it is marked
  unstarred so your tags and notes survive. Find them with the **Unstarred** quick
  filter, or delete them for good with the trash button in the header.
- If GitHub returns an empty star list, the sync leaves your existing list alone rather
  than treating it as "you un-starred everything".
- Your GitHub access token is stored in the database and never leaves the server —
  `/auth/user` deliberately returns only id, username, email and avatar.
- `GET /api/export` gives you every hand-made piece of data (tags, notes, version
  choices) as JSON; `POST /api/import` merges it back.

## License

Apache License 2.0 — see [LICENSE](LICENSE).

## Acknowledgments

- [GitHub REST API](https://docs.github.com/en/rest)
- [shadcn/ui](https://ui.shadcn.com/) and [Radix UI](https://www.radix-ui.com/)
- [react-markdown](https://github.com/remarkjs/react-markdown)
