# Contributing

Thanks for looking. This is a small self-hosted tool; the bar for a change is that it
works, it does not put anyone's data at risk, and someone reading it in a year can tell
why it is written that way.

## Getting set up

[docs/development.md](docs/development.md) covers running the two servers, the project
layout and the test suites. The short version:

```bash
docker compose --profile local-db up -d db      # postgres on 127.0.0.1:25432
cd backend      && npm install && npm run migrate && npm run dev
cd new_frontend && npm install --legacy-peer-deps && npm run dev
```

## Workflow

1. Fork and branch: `git checkout -b feature/amazing-feature`
2. Make the change, with tests where there is logic to test
3. Run the checks below until they pass
4. Commit, push, open a pull request describing **what broke or was missing**, not just
   what you changed

## Before you push

CI runs exactly this. Running it locally is faster than waiting for the red X.

```bash
cd new_frontend
npm run typecheck && npm run lint && npm test && npm run build

cd ../backend
npm run check                                   # every file parses
DB_HOST=127.0.0.1 DB_PORT=25432 npm run migrate
DB_HOST=127.0.0.1 DB_PORT=25432 npm test        # expect 61 tests, 0 skipped
```

**Do not skip the database step.** Without a reachable PostgreSQL the data-layer tests
self-skip, and those are the ones guarding against repository loss. CI fails if they
skip; you should treat a local skip the same way.

If you touched the Dockerfile or Compose file, build the image too:

```bash
docker compose --profile local-db up --build
```

## What a good change looks like

**Explain why in a comment when the code is not obvious.** This codebase leans on that
heavily — most surprising lines carry a note about the failure that shaped them. If you
fix a bug, leave behind the sentence that stops someone re-introducing it.

**Add a test when you fix a bug.** Verify it by re-introducing the bug and confirming the
suite goes red. `backend/test/repo-isolation.test.js` exists for exactly this reason and
both of its bugs were confirmed that way.

**Keep logic out of components.** Anything worth testing on the frontend belongs in
`new_frontend/lib/` as a pure function — that is how `filter-repositories.ts` and
`filter-expression.ts` came to exist. There is no component test runner.

**Use the semantic colour names.** `bg-background`, `text-muted-foreground`,
`border-border`. A literal `text-gray-900` looks fine in light mode and vanishes in dark
mode.

**Never suppress the type checker.** `ignoreBuildErrors` and `ignoreDuringBuilds` are off
deliberately; turning them on is how three copies of the `Repository` interface drifted
apart. Shared shapes live in `lib/types.ts`.

**Migrations need a working `down`.** CI rolls the last two back and re-applies them.
Change the model definition and the migration in the same commit — the models are never
auto-synced.

## Things to be careful with

These have cost users data before. If your change touches one, say so in the PR and
expect the review to focus there.

1. **Repository ownership.** Uniqueness is `(UserId, githubId)`, never `githubId` alone.
   Every read of a repository must be scoped by user or ownership-checked immediately
   after loading.
2. **Sync must not delete.** Un-starring marks `is_followed = false`; only the explicit
   purge endpoint deletes. An empty response from GitHub must never be treated as "the
   user un-starred everything".
3. **Sync must not overwrite user-owned columns** — tags, notes, `currentlyUsedVersion`.
4. **The GitHub access token must never reach the client.** `/auth/user` returns a fixed
   whitelist of fields.
5. **README content is untrusted.** It is sanitised before rendering, and `style` is not
   in the allow-list for a reason.

The reasoning behind each is in
[docs/architecture.md](docs/architecture.md#invariants-worth-protecting).

## Documentation

Docs live in [`docs/`](docs/) and are expected to match the code. If you change
behaviour, update the page that describes it — most usefully
[configuration.md](docs/configuration.md) for a new setting, [api.md](docs/api.md) for an
endpoint change, and [troubleshooting.md](docs/troubleshooting.md) when you fix something
people were hitting.

## Reporting bugs

Include what you expected, what happened, the relevant log lines
(`docker compose logs app`), and how you are running it — Docker or not, bundled database
or your own, and whether a proxy is in play. `/api/health` output helps.
