/**
 * Guards the two bugs that could destroy user data.
 *
 * 1. `Repos.githubId` carried a GLOBAL unique constraint, so `Repo.upsert()` inferred
 *    `ON CONFLICT ("githubId") DO UPDATE SET ... "UserId" = EXCLUDED."UserId"`. When a
 *    second user synced a repository someone else had already starred, the existing row
 *    was reassigned and vanished from the first user's dashboard along with their tags.
 *
 * 2. The sync cleanup used `githubId: { [Op.notIn]: [] }` when GitHub returned no
 *    stars. Sequelize silently DROPS an empty `notIn`, leaving
 *    `DELETE FROM "Repos" WHERE "UserId" = N` - every repository and every custom tag.
 *
 * Both are database-level behaviours, so they are asserted against real Postgres.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');

const { User, Repo, REPO_SYNC_CONFLICT_FIELDS } = require('../src/models');
const SyncService = require('../src/services/syncService');
const { skipReason, reset, close, starPayload } = require('./helpers/db');

test('repository isolation and sync safety', async (t) => {
  const skip = await skipReason();
  if (skip) {
    t.skip(skip);
    return;
  }

  t.after(close);

  await t.test('the schema is scoped per user, not globally', async () => {
    const [indexes] = await require('../src/models').sequelize.query(`
      SELECT idx.indisunique AS uniq,
             (SELECT array_agg(a.attname::text ORDER BY a.attname)
                FROM pg_attribute a
               WHERE a.attrelid = t.oid AND a.attnum = ANY(idx.indkey)) AS cols
        FROM pg_index idx
        JOIN pg_class t ON t.oid = idx.indrelid
       WHERE t.relname = 'Repos'
    `);

    const uniques = indexes.filter(i => i.uniq).map(i => (i.cols || []).join(','));
    assert.ok(
      !uniques.includes('githubId'),
      `githubId must not be globally unique; unique indexes present: ${JSON.stringify(uniques)}`
    );
    assert.ok(
      uniques.includes('UserId,githubId'),
      `expected a unique index on (UserId, githubId); got: ${JSON.stringify(uniques)}`
    );
  });

  await t.test('two users can star the same repository independently', async () => {
    await reset();
    const alice = await User.create({ githubId: 'alice', username: 'alice', accessToken: 'a' });
    const bob = await User.create({ githubId: 'bob', username: 'bob', accessToken: 'b' });

    const shared = starPayload(500100, 'shared');
    const upsert = (userId) =>
      Repo.upsert(
        { ...shared, UserId: userId, isFollowed: true },
        { conflictFields: REPO_SYNC_CONFLICT_FIELDS }
      );

    await upsert(alice.id);
    const aliceRepo = await Repo.findOne({ where: { UserId: alice.id, githubId: '500100' } });
    await aliceRepo.update({ customTags: ['mine'], notes: 'my note', currentlyUsedVersion: 'v1.0.0' });

    // The regression: this used to steal Alice's row.
    await upsert(bob.id);

    const aliceAfter = await Repo.findOne({ where: { UserId: alice.id, githubId: '500100' } });
    const bobAfter = await Repo.findOne({ where: { UserId: bob.id, githubId: '500100' } });

    assert.ok(aliceAfter, "alice's row disappeared after bob synced the same repo");
    assert.ok(bobAfter, 'bob did not get a row of his own');
    assert.notEqual(aliceAfter.id, bobAfter.id, 'both users are sharing one row');
    assert.deepEqual(aliceAfter.customTags, ['mine']);
    assert.equal(aliceAfter.notes, 'my note');
    assert.equal(aliceAfter.currentlyUsedVersion, 'v1.0.0');
    assert.deepEqual(bobAfter.customTags, [], "bob inherited alice's tags");
  });

  await t.test('re-syncing never clobbers user-owned columns', async () => {
    await reset();
    const alice = await User.create({ githubId: 'alice', username: 'alice', accessToken: 'a' });
    const shared = starPayload(500101, 'resync');

    await Repo.upsert({ ...shared, UserId: alice.id }, { conflictFields: REPO_SYNC_CONFLICT_FIELDS });
    const repo = await Repo.findOne({ where: { UserId: alice.id, githubId: '500101' } });
    await repo.update({ customTags: ['keep'], notes: 'keep me', currentlyUsedVersion: 'v2' });

    // Simulate GitHub reporting new upstream metadata.
    await Repo.upsert(
      { ...shared, stargazersCount: 9999, description: 'changed upstream', UserId: alice.id },
      { conflictFields: REPO_SYNC_CONFLICT_FIELDS }
    );
    await repo.reload();

    assert.equal(repo.stargazersCount, 9999, 'upstream metadata should be refreshed');
    assert.equal(repo.description, 'changed upstream');
    assert.deepEqual(repo.customTags, ['keep'], 'tags must survive a sync');
    assert.equal(repo.notes, 'keep me', 'notes must survive a sync');
    assert.equal(repo.currentlyUsedVersion, 'v2', 'the chosen version must survive a sync');
  });

  await t.test('a duplicate (UserId, githubId) is still rejected', async () => {
    await reset();
    const alice = await User.create({ githubId: 'alice', username: 'alice', accessToken: 'a' });
    const payload = starPayload(500102, 'dup');
    await Repo.create({ ...payload, UserId: alice.id });
    await assert.rejects(
      () => Repo.create({ ...payload, UserId: alice.id }),
      (error) => error.name === 'SequelizeUniqueConstraintError' || /unique/i.test(error.message)
    );
  });

  await t.test('an empty star list deletes nothing', async () => {
    await reset();
    const alice = await User.create({ githubId: 'alice', username: 'alice', accessToken: 'a' });
    for (const id of [500200, 500201, 500202]) {
      await Repo.upsert({ ...starPayload(id, `r${id}`), UserId: alice.id, isFollowed: true },
        { conflictFields: REPO_SYNC_CONFLICT_FIELDS });
    }
    await Repo.update({ customTags: ['precious'] }, { where: { UserId: alice.id } });

    const result = await SyncService.reconcileUnfollowed(alice.id, []);

    assert.equal(await Repo.count({ where: { UserId: alice.id } }), 3, 'rows were deleted');
    assert.equal(await Repo.count({ where: { UserId: alice.id, isFollowed: true } }), 3,
      'rows were marked unfollowed on an empty response');
    assert.equal(result.skipped, true, 'the skip was not reported');
    assert.equal(result.unfollowed, 0);
    const survivor = await Repo.findOne({ where: { UserId: alice.id } });
    assert.deepEqual(survivor.customTags, ['precious']);
  });

  await t.test('a genuine un-star marks the row instead of deleting it', async () => {
    await reset();
    const alice = await User.create({ githubId: 'alice', username: 'alice', accessToken: 'a' });
    for (const id of [500300, 500301, 500302]) {
      await Repo.upsert({ ...starPayload(id, `r${id}`), UserId: alice.id, isFollowed: true },
        { conflictFields: REPO_SYNC_CONFLICT_FIELDS });
    }
    await Repo.update({ customTags: ['tag'] }, { where: { UserId: alice.id } });

    const result = await SyncService.reconcileUnfollowed(alice.id, ['500300']);

    assert.equal(result.skipped, false);
    assert.equal(result.unfollowed, 2);
    assert.equal(await Repo.count({ where: { UserId: alice.id } }), 3, 'nothing should be deleted');

    const gone = await Repo.findAll({
      where: { UserId: alice.id, isFollowed: false },
      order: [['githubId', 'ASC']]
    });
    assert.deepEqual(gone.map(r => r.githubId), ['500301', '500302']);
    assert.deepEqual(gone[0].customTags, ['tag'], 'tags must survive an un-star');
  });

  await t.test('re-starring clears the unfollowed flag', async () => {
    await reset();
    const alice = await User.create({ githubId: 'alice', username: 'alice', accessToken: 'a' });
    const payload = starPayload(500400, 'restar');
    await Repo.upsert({ ...payload, UserId: alice.id, isFollowed: true },
      { conflictFields: REPO_SYNC_CONFLICT_FIELDS });
    await SyncService.reconcileUnfollowed(alice.id, ['999999']);
    assert.equal((await Repo.findOne({ where: { UserId: alice.id } })).isFollowed, false);

    await Repo.upsert({ ...payload, UserId: alice.id, isFollowed: true },
      { conflictFields: REPO_SYNC_CONFLICT_FIELDS });
    assert.equal((await Repo.findOne({ where: { UserId: alice.id } })).isFollowed, true,
      'a re-starred repo must come back');
  });

  await t.test('one user never sees or reconciles another user\'s repositories', async () => {
    await reset();
    const alice = await User.create({ githubId: 'alice', username: 'alice', accessToken: 'a' });
    const bob = await User.create({ githubId: 'bob', username: 'bob', accessToken: 'b' });
    await Repo.upsert({ ...starPayload(500500, 'a-only'), UserId: alice.id, isFollowed: true },
      { conflictFields: REPO_SYNC_CONFLICT_FIELDS });
    await Repo.upsert({ ...starPayload(500501, 'b-only'), UserId: bob.id, isFollowed: true },
      { conflictFields: REPO_SYNC_CONFLICT_FIELDS });

    // Bob syncs and no longer stars anything he had; Alice must be untouched.
    await SyncService.reconcileUnfollowed(bob.id, ['500502']);

    assert.equal((await Repo.findOne({ where: { UserId: alice.id } })).isFollowed, true);
    assert.equal((await Repo.findOne({ where: { UserId: bob.id } })).isFollowed, false);
  });

  await t.test('array operators target the mapped "tags" column', async () => {
    await reset();
    const alice = await User.create({ githubId: 'alice', username: 'alice', accessToken: 'a' });
    await Repo.upsert({ ...starPayload(500600, 'tagged'), UserId: alice.id },
      { conflictFields: REPO_SYNC_CONFLICT_FIELDS });
    await Repo.update({ customTags: ['node.js', 'cli'] }, { where: { UserId: alice.id } });

    assert.equal(
      (await Repo.findAll({ where: { UserId: alice.id, customTags: { [Op.overlap]: ['node.js'] } } })).length,
      1, 'Op.overlap did not match'
    );
    assert.equal(
      (await Repo.findAll({ where: { UserId: alice.id, customTags: { [Op.contains]: ['cli'] } } })).length,
      1, 'Op.contains did not match'
    );
    assert.equal(
      (await Repo.findAll({ where: { UserId: alice.id, customTags: { [Op.overlap]: ['absent'] } } })).length,
      0
    );
  });

  await t.test('sorting with NULLS LAST is valid SQL for every allowed sort column', async () => {
    await reset();
    const alice = await User.create({ githubId: 'alice', username: 'alice', accessToken: 'a' });
    await Repo.upsert({ ...starPayload(500700, 'sortable'), pushedAt: null, UserId: alice.id },
      { conflictFields: REPO_SYNC_CONFLICT_FIELDS });

    for (const column of ['starredAt', 'stargazersCount', 'name', 'fullName', 'forksCount', 'pushedAt', 'githubUpdatedAt']) {
      for (const direction of ['ASC NULLS LAST', 'DESC NULLS LAST']) {
        const rows = await Repo.findAll({ where: { UserId: alice.id }, order: [[column, direction]] });
        assert.equal(rows.length, 1, `${column} ${direction} failed`);
      }
    }
  });
});
