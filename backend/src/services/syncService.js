const { Sequelize } = require('sequelize');
const { User, Repo, sequelize, SyncStatus } = require('../models');
const GitHubService = require('./githubService');
const ReleaseService = require('./releaseService');

const STALE_AFTER_MS = 2 * 60 * 60 * 1000; // 2 hours

class SyncService {
  static async getActiveInProgressSync(userId) {
    const existingInProgress = await SyncStatus.findOne({
      where: { userId, status: 'in_progress' },
      order: [['createdAt', 'DESC']]
    });

    if (!existingInProgress) return null;
    const startedAt = existingInProgress.createdAt ? existingInProgress.createdAt.getTime() : 0;
    if (startedAt && Date.now() - startedAt > STALE_AFTER_MS) {
      await existingInProgress.update({
        status: 'failed',
        error: 'Sync marked stale after 2 hours without completion'
      });
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

    // Use a transaction with row-level locking to prevent race conditions
    return await sequelize.transaction(async (t) => {
      // Check for existing in-progress sync within the transaction
      const existingInProgress = await SyncStatus.findOne({
        where: { userId: user.id, status: 'in_progress' },
        order: [['createdAt', 'DESC']],
        lock: t.LOCK.UPDATE,
        transaction: t
      });

      if (existingInProgress) {
        const startedAt = existingInProgress.createdAt ? existingInProgress.createdAt.getTime() : 0;
        if (startedAt && Date.now() - startedAt > STALE_AFTER_MS) {
          await existingInProgress.update({
            status: 'failed',
            error: 'Sync marked stale after 2 hours without completion'
          }, { transaction: t });
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

      // Start background sync after transaction commits
      setImmediate(() => {
        this.backgroundSync(user, syncStatus.id).catch(error => {
          syncStatus.update({
            status: 'failed',
            error: error.message
          }).catch(console.error);
          console.error('Background sync failed:', error);
        });
      });

      return { started: true, syncStatus };
    });
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
              UserId: user.id
            }, { transaction: t });
          }
        });
        
        // Update progress
        const progress = stars.length > 0 ? Math.min(((i + batch.length) / stars.length) * 100, 100) : 100;
        await syncStatus.update({ progress });
        console.log(`Processed ${i + batch.length}/${stars.length} repositories`);
      }

      // Clean up old repos
      const currentStarIds = new Set(stars.map(star => star.githubId));
      await Repo.destroy({
        where: {
          UserId: user.id,
          githubId: {
            [Sequelize.Op.notIn]: Array.from(currentStarIds)
          }
        }
      });

      // Mark sync as completed
      await syncStatus.update({
        status: 'completed',
        progress: 100
      });

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
