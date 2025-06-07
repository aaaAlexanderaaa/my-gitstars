const { Sequelize } = require('sequelize');
const { User, Repo, sequelize, SyncStatus } = require('../models');
const GitHubService = require('./githubService');
const ReleaseService = require('./releaseService');

class SyncService {
  static async syncUserStars(userId) {
    console.log('Syncing user stars for user:', userId);
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Create new sync status
    const syncStatus = await SyncStatus.create({
      userId: user.id,
      status: 'in_progress',
      progress: 0
    });

    // Start background sync
    this.backgroundSync(user).catch(error => {
      // Update status on error
      syncStatus.update({
        status: 'failed',
        error: error.message
      }).catch(console.error);
      console.error('Background sync failed:', error);
    });

    // Return immediately
    return { message: 'Sync started in background' };
  }

  static async backgroundSync(user) {
    const BATCH_SIZE = 100;
    const githubService = new GitHubService(user.accessToken);
    
    // Get latest sync status
    const syncStatus = await SyncStatus.findOne({
      where: { userId: user.id },
      order: [['createdAt', 'DESC']]
    });
    
    try {
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
        const progress = Math.min(((i + batch.length) / stars.length) * 100, 100);
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
      await syncStatus.update({
        status: 'failed',
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = SyncService; 