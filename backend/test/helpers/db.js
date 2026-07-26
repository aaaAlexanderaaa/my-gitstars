/**
 * Shared setup for tests that need a real PostgreSQL.
 *
 * These tests exercise behaviour that only exists in the database - ON CONFLICT
 * targets, array operators, `NOT IN ()` degeneracy - so they cannot be faked. When no
 * database is reachable they are skipped rather than failed, so `npm test` still works
 * on a machine without Postgres.
 *
 *   docker compose --profile local-db up -d db
 *   DB_HOST=127.0.0.1 DB_PORT=25432 npm test
 *
 * NOTE: `reset()` truncates shared tables, so the suites that use it must not run
 * concurrently. `npm run test:unit` passes --test-concurrency=1 for that reason.
 */
const { sequelize } = require('../../src/models');

let availability = null;

/** @returns {Promise<string|false>} a skip reason, or false when the database is usable. */
async function skipReason() {
  if (availability !== null) return availability;
  try {
    await sequelize.authenticate();
    const [rows] = await sequelize.query(`SELECT to_regclass('"Repos"') AS t`);
    if (!rows[0].t) {
      availability = 'database reachable but not migrated (run: npm run migrate)';
    } else {
      availability = false;
    }
  } catch (error) {
    availability = `no database at ${sequelize.config.host}:${sequelize.config.port} (${error.message.split('\n')[0]})`;
  }
  return availability;
}

/** Removes all rows created by tests. Users cascade to repos and sync statuses. */
async function reset() {
  await sequelize.query('TRUNCATE TABLE "Releases", "Repos", "SyncStatuses", "Users" RESTART IDENTITY CASCADE');
}

async function close() {
  await sequelize.close().catch(() => {});
}

/** A starred-repo payload shaped exactly like githubService.getAllStarredRepos output. */
function starPayload(githubId, name, overrides = {}) {
  return {
    githubId: String(githubId),
    name,
    fullName: `owner/${name}`,
    description: `${name} description`,
    url: `https://github.com/owner/${name}`,
    language: 'Rust',
    owner: 'owner',
    topics: ['cli'],
    fork: false,
    forksCount: 1,
    stargazersCount: 2,
    watchersCount: 2,
    defaultBranch: 'master',
    isTemplate: false,
    archived: false,
    visibility: 'public',
    pushedAt: new Date(),
    githubCreatedAt: new Date(),
    githubUpdatedAt: new Date(),
    starredAt: new Date(),
    ...overrides
  };
}

module.exports = { sequelize, skipReason, reset, close, starPayload };
