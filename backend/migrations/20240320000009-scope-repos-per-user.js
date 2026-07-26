'use strict';

/**
 * `Repos.githubId` was created with a GLOBAL unique constraint even though a repo
 * row belongs to a single user. Because `Repo.upsert()` infers its conflict target
 * from that constraint, Postgres emitted:
 *
 *   INSERT INTO "Repos" (...) VALUES (...)
 *   ON CONFLICT ("githubId") DO UPDATE SET ..., "UserId"=EXCLUDED."UserId"
 *
 * so whenever a second user synced a repository someone else had already starred,
 * the existing row was reassigned to the second user and disappeared from the first
 * user's dashboard (together with the tags they had put on it).
 *
 * This migration replaces the global constraint with a per-user composite unique
 * index and adds the indexes the hot query paths need.
 */

const UNIQUE_INDEX_NAME = 'repos_user_id_github_id_unique';

async function dropGlobalGithubIdUnique(queryInterface) {
  const sequelize = queryInterface.sequelize;

  // A UNIQUE *constraint* (what createTable's `unique: true` produces) must be
  // dropped with ALTER TABLE; its backing index cannot be removed on its own.
  const [constraints] = await sequelize.query(`
    SELECT con.conname AS name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE rel.relname = 'Repos'
      AND nsp.nspname = current_schema()
      AND con.contype = 'u'
      AND (
        SELECT array_agg(att.attname::text ORDER BY att.attname)
        FROM pg_attribute att
        WHERE att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
      ) = ARRAY['githubId']
  `);

  for (const { name } of constraints) {
    await sequelize.query(`ALTER TABLE "Repos" DROP CONSTRAINT "${name}"`);
  }

  // Also handle databases where it exists as a bare unique index.
  const [indexes] = await sequelize.query(`
    SELECT i.relname AS name
    FROM pg_index idx
    JOIN pg_class i ON i.oid = idx.indexrelid
    JOIN pg_class t ON t.oid = idx.indrelid
    JOIN pg_namespace nsp ON nsp.oid = t.relnamespace
    WHERE t.relname = 'Repos'
      AND nsp.nspname = current_schema()
      AND idx.indisunique
      AND NOT idx.indisprimary
      AND (
        SELECT array_agg(att.attname::text ORDER BY att.attname)
        FROM pg_attribute att
        WHERE att.attrelid = t.oid AND att.attnum = ANY(idx.indkey)
      ) = ARRAY['githubId']
  `);

  for (const { name } of indexes) {
    await sequelize.query(`DROP INDEX IF EXISTS "${name}"`);
  }
}

async function hasIndex(queryInterface, tableName, name) {
  const indexes = await queryInterface.showIndex(tableName);
  return indexes.some(index => index.name === name);
}

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await dropGlobalGithubIdUnique(queryInterface);

    // Safety net: if a previous run of the buggy sync left duplicates behind
    // (possible only if the constraint had already been dropped by hand), keep the
    // most recently updated row per (UserId, githubId) so the unique index applies.
    await queryInterface.sequelize.query(`
      DELETE FROM "Repos" r
      USING "Repos" dup
      WHERE r."UserId" IS NOT DISTINCT FROM dup."UserId"
        AND r."githubId" = dup."githubId"
        AND (r."updatedAt", r."id") < (dup."updatedAt", dup."id")
    `);

    if (!(await hasIndex(queryInterface, 'Repos', UNIQUE_INDEX_NAME))) {
      await queryInterface.addIndex('Repos', ['UserId', 'githubId'], {
        unique: true,
        name: UNIQUE_INDEX_NAME
      });
    }

    if (!(await hasIndex(queryInterface, 'Repos', 'repos_user_id_is_followed_idx'))) {
      await queryInterface.addIndex('Repos', ['UserId', 'is_followed'], {
        name: 'repos_user_id_is_followed_idx'
      });
    }

    // Op.overlap on tags/topics is a sequential scan without a GIN index.
    if (!(await hasIndex(queryInterface, 'Repos', 'repos_tags_gin_idx'))) {
      await queryInterface.addIndex('Repos', ['tags'], {
        name: 'repos_tags_gin_idx',
        using: 'gin'
      });
    }

    if (!(await hasIndex(queryInterface, 'Repos', 'repos_topics_gin_idx'))) {
      await queryInterface.addIndex('Repos', ['topics'], {
        name: 'repos_topics_gin_idx',
        using: 'gin'
      });
    }

    // The sync-status polling endpoint runs this lookup every 5 seconds per client.
    if (!(await hasIndex(queryInterface, 'SyncStatuses', 'sync_statuses_user_id_status_idx'))) {
      await queryInterface.addIndex('SyncStatuses', ['user_id', 'status', 'updated_at'], {
        name: 'sync_statuses_user_id_status_idx'
      });
    }
  },

  down: async (queryInterface) => {
    for (const [table, name] of [
      ['SyncStatuses', 'sync_statuses_user_id_status_idx'],
      ['Repos', 'repos_topics_gin_idx'],
      ['Repos', 'repos_tags_gin_idx'],
      ['Repos', 'repos_user_id_is_followed_idx'],
      ['Repos', UNIQUE_INDEX_NAME]
    ]) {
      if (await hasIndex(queryInterface, table, name)) {
        await queryInterface.removeIndex(table, name);
      }
    }

    // Restoring the global unique constraint is only possible while no two users share
    // a starred repository - which is exactly the situation this migration enabled.
    // Skip it with a warning rather than failing the rollback outright.
    const [[{ duplicates }]] = await queryInterface.sequelize.query(`
      SELECT COUNT(*)::int AS duplicates FROM (
        SELECT "githubId" FROM "Repos" GROUP BY "githubId" HAVING COUNT(*) > 1
      ) AS d
    `);

    if (duplicates > 0) {
      console.warn(
        `[migration] ${duplicates} githubId values are shared by more than one user; ` +
        'leaving the global unique constraint off. Remove the duplicate rows first if you need it back.'
      );
      return;
    }

    await queryInterface.addConstraint('Repos', {
      fields: ['githubId'],
      type: 'unique',
      name: 'Repos_githubId_key'
    });
  }
};
