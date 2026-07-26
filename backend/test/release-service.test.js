/**
 * Release and version-selection behaviour.
 *
 * Needs a real database (releases are stored rows) but never touches the network: a
 * stub GitHubService supplies the release list. This is the area the repo's history
 * churned on most - "fix changelog preview error", "fix proxy and release handling".
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { User, Repo, Release, REPO_SYNC_CONFLICT_FIELDS } = require('../src/models');
const ReleaseService = require('../src/services/releaseService');
const { skipReason, reset, close, starPayload } = require('./helpers/db');

const day = 24 * 60 * 60 * 1000;

/** A GitHubService stand-in returning a fixed release list (or throwing). */
function stubGitHub(releases, { throws } = {}) {
  return {
    rateLimitRemaining: null,
    getRepositoryReleases: async () => {
      if (throws) throw throws;
      return releases;
    }
  };
}

const release = (tagName, { daysAgo = 0, prerelease = false, draft = false, id = tagName } = {}) => ({
  githubReleaseId: `id-${id}`,
  tagName,
  name: tagName,
  body: `notes for ${tagName}`,
  publishedAt: new Date(Date.now() - daysAgo * day),
  isPrerelease: prerelease,
  isDraft: draft
});

test('release and version handling', async (t) => {
  const skip = await skipReason();
  if (skip) {
    t.skip(skip);
    return;
  }

  t.after(close);

  /** Fresh user + repo for each case. */
  async function fixture(overrides = {}) {
    await reset();
    const user = await User.create({ githubId: 'u1', username: 'u1', accessToken: 'tok' });
    await Repo.upsert(
      { ...starPayload(700100, 'proj'), UserId: user.id, isFollowed: true, ...overrides },
      { conflictFields: REPO_SYNC_CONFLICT_FIELDS }
    );
    const repo = await Repo.findOne({ where: { UserId: user.id } });
    return { user, repo };
  }

  await t.test('picks the newest stable release as latestVersion', async () => {
    const { user, repo } = await fixture();
    await ReleaseService.fetchAndStoreReleases(repo.id, user, stubGitHub([
      release('v2.0.0-rc1', { daysAgo: 1, prerelease: true }),
      release('v1.9.0', { daysAgo: 5 }),
      release('v1.8.0', { daysAgo: 30 })
    ]));
    await repo.reload();
    assert.equal(repo.latestVersion, 'v1.9.0', 'a pre-release must not become "latest"');
    assert.equal(repo.hasReleases, true);
    assert.equal(repo.currentlyUsedVersion, 'v1.9.0', 'first fetch adopts the latest stable');
    assert.equal(repo.updateAvailable, false);
  });

  await t.test('orders by published date, not by the order GitHub returned', async () => {
    const { user, repo } = await fixture();
    // The list endpoint is ordered by created_at, which can disagree with published_at.
    await ReleaseService.fetchAndStoreReleases(repo.id, user, stubGitHub([
      release('v1.0.0', { daysAgo: 40 }),
      release('v3.0.0', { daysAgo: 1 }),
      release('v2.0.0', { daysAgo: 20 })
    ]));
    await repo.reload();
    assert.equal(repo.latestVersion, 'v3.0.0');
  });

  await t.test('falls back to the newest pre-release when no stable release exists', async () => {
    const { user, repo } = await fixture();
    await ReleaseService.fetchAndStoreReleases(repo.id, user, stubGitHub([
      release('v0.3.0-beta', { daysAgo: 1, prerelease: true }),
      release('v0.2.0-beta', { daysAgo: 10, prerelease: true })
    ]));
    await repo.reload();
    assert.equal(repo.latestVersion, 'v0.3.0-beta',
      'a pre-release-only project should still get version tracking');
    assert.equal(repo.hasReleases, true);
  });

  await t.test('drafts are never stored or offered', async () => {
    const { user, repo } = await fixture();
    await ReleaseService.fetchAndStoreReleases(repo.id, user, stubGitHub([
      release('v9.9.9', { draft: true, id: 'draft' }),
      release('v1.0.0', { daysAgo: 2 })
    ]));
    await repo.reload();
    const stored = await Release.findAll({ where: { repoId: repo.id } });
    assert.deepEqual(stored.map(r => r.tagName).sort(), ['v1.0.0'],
      'a draft release is invisible to users and must not be selectable');
    assert.equal(repo.latestVersion, 'v1.0.0');
  });

  await t.test('a repo with no releases is cleared, not left with a stale version', async () => {
    const { user, repo } = await fixture();
    await repo.update({ latestVersion: 'v1.0.0', updateAvailable: true, hasReleases: true });

    await ReleaseService.fetchAndStoreReleases(repo.id, user, stubGitHub([]));
    await repo.reload();

    assert.equal(repo.hasReleases, false);
    assert.equal(repo.latestVersion, null, 'a stale latestVersion kept the update flag lit forever');
    assert.equal(repo.updateAvailable, false);
    assert.equal(repo.releasesFetchError, null);
  });

  await t.test('updateAvailable is set only when a newer version really exists', async () => {
    const { user, repo } = await fixture();
    await ReleaseService.fetchAndStoreReleases(repo.id, user, stubGitHub([
      release('v1.0.0', { daysAgo: 10 })
    ]));

    // The user pins an older version -> update available.
    await Release.create({
      repoId: repo.id, githubReleaseId: 'id-old', tagName: 'v0.9.0',
      publishedAt: new Date(Date.now() - 60 * day), isPrerelease: false, isDraft: false
    });
    let updated = await ReleaseService.updateCurrentlyUsedVersion(repo.id, user.id, 'v0.9.0');
    assert.equal(updated.updateAvailable, true);

    // Back on the latest -> no update.
    updated = await ReleaseService.updateCurrentlyUsedVersion(repo.id, user.id, 'v1.0.0');
    assert.equal(updated.updateAvailable, false);

    // "Not using" -> no update.
    updated = await ReleaseService.updateCurrentlyUsedVersion(repo.id, user.id, null);
    assert.equal(updated.currentlyUsedVersion, null);
    assert.equal(updated.updateAvailable, false);
  });

  await t.test('a null latestVersion can never mean "update available"', async () => {
    const { user, repo } = await fixture();
    await Release.create({
      repoId: repo.id, githubReleaseId: 'id-x', tagName: 'v1.2.3',
      publishedAt: new Date(), isPrerelease: false, isDraft: false
    });
    await repo.update({ latestVersion: null, hasReleases: true, releasesLastFetched: new Date() });

    const updated = await ReleaseService.updateCurrentlyUsedVersion(repo.id, user.id, 'v1.2.3');
    assert.equal(updated.updateAvailable, false,
      'comparing a version against null used to light the update badge permanently');
  });

  await t.test('selecting a version that does not exist is rejected', async () => {
    const { user, repo } = await fixture();
    await repo.update({ hasReleases: true, releasesLastFetched: new Date() });
    await assert.rejects(
      () => ReleaseService.updateCurrentlyUsedVersion(repo.id, user.id, 'v-nope'),
      /Selected version not found/
    );
  });

  await t.test('another user cannot read or change this repo\'s versions', async () => {
    const { repo } = await fixture();
    const intruder = await User.create({ githubId: 'u2', username: 'u2', accessToken: 'tok2' });
    await assert.rejects(
      () => ReleaseService.fetchAndStoreReleases(repo.id, intruder, stubGitHub([])),
      /access denied/
    );
    await assert.rejects(
      () => ReleaseService.updateCurrentlyUsedVersion(repo.id, intruder.id, null),
      /access denied|not found/i
    );
  });

  await t.test('a failed fetch is recorded and retried soon, not cached for a day', async () => {
    const { user, repo } = await fixture();
    const boom = Object.assign(new Error('GitHub exploded'), { status: 500 });

    await assert.rejects(
      () => ReleaseService.fetchAndStoreReleases(repo.id, user, stubGitHub([], { throws: boom }))
    );
    await repo.reload();

    assert.match(repo.releasesFetchError, /GitHub exploded/);
    const age = Date.now() - repo.releasesLastFetched.getTime();
    assert.ok(age > 23 * 60 * 60 * 1000,
      'the stamp must be backdated so the 24h cache does not hide the failure for a day');
    assert.ok(age < day, 'but not so far back that it is treated as never fetched');
  });

  await t.test('a successful fetch clears a previous error', async () => {
    const { user, repo } = await fixture();
    await repo.update({ releasesFetchError: 'stale failure' });
    await ReleaseService.fetchAndStoreReleases(repo.id, user, stubGitHub([release('v1.0.0')]));
    await repo.reload();
    assert.equal(repo.releasesFetchError, null);
  });

  await t.test('re-fetching updates a retagged release instead of duplicating it', async () => {
    const { user, repo } = await fixture();
    await ReleaseService.fetchAndStoreReleases(repo.id, user, stubGitHub([
      release('v1.0.0', { daysAgo: 2, id: 'stable' })
    ]));
    // Same GitHub release id, different tag name.
    await ReleaseService.fetchAndStoreReleases(repo.id, user, stubGitHub([
      { ...release('v1.0.1', { daysAgo: 2, id: 'stable' }) }
    ]));

    const stored = await Release.findAll({ where: { repoId: repo.id } });
    assert.equal(stored.length, 1, 'keying on githubReleaseId should update, not insert');
    assert.equal(stored[0].tagName, 'v1.0.1');
  });

  await t.test('a release deleted upstream stops being offered', async () => {
    const { user, repo } = await fixture();
    await ReleaseService.fetchAndStoreReleases(repo.id, user, stubGitHub([
      release('v2.0.0', { daysAgo: 1, id: 'two' }),
      release('v1.0.0', { daysAgo: 5, id: 'one' })
    ]));
    assert.equal((await Release.findAll({ where: { repoId: repo.id } })).length, 2);

    // v2.0.0 is unpublished; v1.0.0 is still the oldest in the window.
    await ReleaseService.fetchAndStoreReleases(repo.id, user, stubGitHub([
      release('v1.0.0', { daysAgo: 5, id: 'one' })
    ]));

    const remaining = await Release.findAll({ where: { repoId: repo.id } });
    assert.deepEqual(remaining.map(r => r.tagName), ['v1.0.0']);
    await repo.reload();
    assert.equal(repo.latestVersion, 'v1.0.0');
  });

  await t.test('pruning never reaches past the fetched window', async () => {
    const { user, repo } = await fixture();
    // An ancient release from before the 30-item page we can see.
    await Release.create({
      repoId: repo.id, githubReleaseId: 'id-ancient', tagName: 'v0.0.1',
      publishedAt: new Date(Date.now() - 900 * day), isPrerelease: false, isDraft: false
    });

    await ReleaseService.fetchAndStoreReleases(repo.id, user, stubGitHub([
      release('v5.0.0', { daysAgo: 1, id: 'five' })
    ]));

    const tags = (await Release.findAll({ where: { repoId: repo.id } })).map(r => r.tagName).sort();
    assert.deepEqual(tags, ['v0.0.1', 'v5.0.0'],
      'history older than the fetched page must be left alone');
  });

  await t.test('getEffectiveVersion respects an explicit "not using" choice', () => {
    assert.equal(
      ReleaseService.getEffectiveVersion({ hasReleases: true, currentlyUsedVersion: null, latestVersion: 'v9' }),
      null,
      'once releases are known, "not using" must not fall back to latest'
    );
    assert.equal(
      ReleaseService.getEffectiveVersion({ hasReleases: true, currentlyUsedVersion: 'v1', latestVersion: 'v9' }),
      'v1'
    );
    assert.equal(
      ReleaseService.getEffectiveVersion({ hasReleases: false, currentlyUsedVersion: null, latestVersion: 'v9' }),
      'v9',
      'before the first fetch, latestVersion is the best guess'
    );
  });

  await t.test('bulk fetch skips repos the user no longer stars', async () => {
    await reset();
    const user = await User.create({ githubId: 'u1', username: 'u1', accessToken: 'tok' });
    for (const [id, followed] of [[800100, true], [800101, false]]) {
      await Repo.upsert(
        { ...starPayload(id, `r${id}`), UserId: user.id, isFollowed: followed },
        { conflictFields: REPO_SYNC_CONFLICT_FIELDS }
      );
    }
    await Repo.update({ isFollowed: false }, { where: { UserId: user.id, githubId: '800101' } });

    const results = await ReleaseService.bulkFetchReleases(user.id, 10);
    assert.equal(results.processed, 1, 'un-starred repos must not consume GitHub rate limit');
  });
});
