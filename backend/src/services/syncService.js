const { Op } = require('sequelize');
const { User, Repo, sequelize, SyncStatus, REPO_SYNC_CONFLICT_FIELDS } = require('../models');
const GitHubService = require('./githubService');
const ReleaseService = require('./releaseService');

// A sync that has not reported progress for this long is treated as dead. Kept short
// enough that a process restart mid-sync does not lock the user out for hours.
const STALE_AFTER_MS = parseInt(process.env.SYNC_STALE_AFTER_MS || '', 10) > 0
  ? parseInt(process.env.SYNC_STALE_AFTER_MS, 10)
  : 20 * 60 * 1000; // 20 minutes
// Arbitrary but fixed first key for pg_advisory_xact_lock, to avoid colliding with
// advisory locks taken by anything else sharing the database.
const SYNC_LOCK_NAMESPACE = 4242;

const STALE_MESSAGE = `Sync abandoned after ${Math.round(STALE_AFTER_MS / 60000)} minutes without progress`;

/**
 * Staleness is measured from the LAST update, not from creation: a sync for an
 * account with thousands of stars legitimately runs for a long time while bumping
 * `progress`, and judging it by `createdAt` would kill it mid-run.
 */
function isStale(syncStatus) {
  const lastActivity = syncStatus.updatedAt || syncStatus.createdAt;
  if (!lastActivity) return false;
  return Date.now() - lastActivity.getTime() > STALE_AFTER_MS;
}

class SyncService {
  static async getActiveInProgressSync(userId) {
    const existingInProgress = await SyncStatus.findOne({
      where: { userId, status: 'in_progress' },
      order: [['createdAt', 'DESC']]
    });

    if (!existingInProgress) return null;
    if (isStale(existingInProgress)) {
      await existingInProgress.update({ status: 'failed', error: STALE_MESSAGE });
      return null;
    }

    return existingInProgress;
  }

  static async syncUserStars(userId) {
    console.log('Syncing user stars for user:', userId);
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('User not found');
    }

    return await sequelize.transaction(async (t) => {
      // SELECT ... FOR UPDATE only locks rows that already exist, so when no sync is
      // running there is nothing to lock and two concurrent requests both got past the
      // check. A transaction-scoped advisory lock serialises them properly; it is
      // released automatically on commit or rollback.
      await sequelize.query(
        'SELECT pg_advisory_xact_lock(:namespace, :userId)',
        { replacements: { namespace: SYNC_LOCK_NAMESPACE, userId: user.id }, transaction: t }
      );

      // Check for existing in-progress sync within the transaction
      const existingInProgress = await SyncStatus.findOne({
        where: { userId: user.id, status: 'in_progress' },
        order: [['createdAt', 'DESC']],
        lock: t.LOCK.UPDATE,
        transaction: t
      });

      if (existingInProgress) {
        if (isStale(existingInProgress)) {
          await existingInProgress.update(
            { status: 'failed', error: STALE_MESSAGE },
            { transaction: t }
          );
        } else {
          return { started: false, syncStatus: existingInProgress };
        }
      }

      // Create new sync status within the same transaction
      const syncStatus = await SyncStatus.create({
        userId: user.id,
        status: 'in_progress',
        progress: 0
      }, { transaction: t });

      // Kick the background job off only once the transaction has actually committed,
      // otherwise backgroundSync can look for a SyncStatus row that is not visible yet.
      // `backgroundSync` already records its own failures, so just log here.
      t.afterCommit(() => {
        SyncService.backgroundSync(user, syncStatus.id).catch(error => {
          console.error('Background sync failed:', error);
        });
      });

      return { started: true, syncStatus };
    });
  }

  /**
   * Marks repositories the user no longer stars as unfollowed.
   *
   * Deliberately does NOT delete: the row carries user-owned data (custom tags,
   * notes, the chosen version) that would be unrecoverable. Use
   * `DELETE /api/repos/unfollowed` to purge them on purpose.
   */
  static async reconcileUnfollowed(userId, currentStarIds) {
    if (currentStarIds.length === 0) {
      // An empty star list is far more often a transient GitHub response than a user
      // un-starring everything, and `Op.notIn: []` is silently dropped by Sequelize
      // (it would turn into an unscoped "everything" match). Skip the sweep and say so.
      const existing = await Repo.count({ where: { UserId: userId, isFollowed: true } });
      if (existing > 0) {
        console.warn(`[sync] GitHub returned 0 starred repos for user ${userId} but ${existing} are on record - skipping the unfollow sweep`);
        return { unfollowed: 0, skipped: true };
      }
      return { unfollowed: 0, skipped: false };
    }

    const [unfollowed] = await Repo.update(
      { isFollowed: false },
      {
        where: {
          UserId: userId,
          isFollowed: true,
          githubId: { [Op.notIn]: currentStarIds }
        }
      }
    );

    return { unfollowed, skipped: false };
  }

  static async backgroundSync(user, syncStatusId) {
    const BATCH_SIZE = 100;
    const githubService = new GitHubService(user.accessToken);

    let syncStatus = null;

    try {
      syncStatus = await SyncStatus.findOne({
        where: { id: syncStatusId, userId: user.id }
      });
      if (!syncStatus) {
        console.warn(`Sync status not found (id=${syncStatusId}, userId=${user.id})`);
        throw new Error('Sync status not found');
      }

      // Get all starred repos
      const stars = await githubService.getAllStarredRepos();
      console.log(`Fetched ${stars.length} starred repositories`);

      // Process in batches
      for (let i = 0; i < stars.length; i += BATCH_SIZE) {
        const batch = stars.slice(i, i + BATCH_SIZE);
        await sequelize.transaction(async (t) => {
          for (const star of batch) {
            await Repo.upsert({
              ...star,
              UserId: user.id,
              // Re-starring a repo must clear a previous unfollow. `is_followed` is
              // only in the ON CONFLICT update list when it is passed explicitly.
              isFollowed: true
            }, {
              // Without this, the conflict target is inferred from the unique index on
              // githubId alone and the row gets reassigned to whoever synced last.
              conflictFields: REPO_SYNC_CONFLICT_FIELDS,
              transaction: t
            });
          }
        });

        // Update progress
        const progress = stars.length > 0 ? Math.min(((i + batch.length) / stars.length) * 100, 100) : 100;
        await syncStatus.update({ progress });
        console.log(`Processed ${i + batch.length}/${stars.length} repositories`);
      }

      const { unfollowed, skipped } = await this.reconcileUnfollowed(
        user.id,
        stars.map(star => star.githubId)
      );

      // Mark sync as completed
      await syncStatus.update({
        status: 'completed',
        progress: 100,
        error: skipped
          ? 'GitHub returned no starred repositories; kept the existing list untouched.'
          : null
      });

      if (unfollowed > 0) {
        console.log(`[sync] marked ${unfollowed} repositories as unfollowed for user ${user.id}`);
      }

      // Background fetch releases for newly synced repos (non-blocking)
      ReleaseService.bulkFetchReleases(user.id, 30).catch(error => {
        console.warn('Background release fetch failed:', error);
      });
    } catch (error) {
      console.error('Sync error:', error);

      try {
        const [updatedCount] = await SyncStatus.update({
          status: 'failed',
          error: error.message
        }, {
          where: { id: syncStatusId, userId: user.id }
        });

        if (!updatedCount) {
          console.warn(`Failed to mark sync as failed (missing status id=${syncStatusId}, userId=${user.id})`);
        }
      } catch (updateError) {
        console.error('Failed to update sync status:', updateError);
      }
      throw error;
    }
  }
}

module.exports = SyncService; 
