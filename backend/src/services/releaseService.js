const { Repo, Release, User } = require('../models');
const GitHubService = require('./githubService');

class ReleaseService {
  /**
   * Fetch and store releases for a specific repository
   * @param {number} repoId - Internal repository ID
   * @param {Object} user - User object with access token
   * @returns {Promise<Array>} Array of releases
   */
  static async fetchAndStoreReleases(repoId, user) {
    const repo = await Repo.findByPk(repoId);
    if (!repo) {
      throw new Error('Repository not found');
    }

    const githubService = new GitHubService(user.accessToken);
    
    try {
      // Fetch releases from GitHub
      const releases = await githubService.getRepositoryReleases(repo.owner, repo.name);
      
      if (releases.length === 0) {
        // No releases found, update repo status
        await repo.update({
          hasReleases: false,
          releasesLastFetched: new Date()
        });
        return [];
      }

      // Store releases in database
      const storedReleases = [];
      for (const releaseData of releases) {
        const [release, created] = await Release.findOrCreate({
          where: { 
            repoId: repo.id, 
            githubReleaseId: releaseData.githubReleaseId 
          },
          defaults: {
            ...releaseData,
            repoId: repo.id
          }
        });

        // Update existing release if not created
        if (!created) {
          await release.update(releaseData);
        }

        storedReleases.push(release);
      }

      // Update repository metadata
      const latestRelease = releases.find(r => !r.isPrerelease && !r.isDraft) || releases[0];
      const updateData = {
        hasReleases: true,
        releasesLastFetched: new Date()
      };

          // Always update latest_version to the most recent
    if (latestRelease) {
      updateData.latestVersion = latestRelease.tagName;

      // Set currently_used_version to latest if not already set (for new repos)
      if (!repo.currentlyUsedVersion) {
        updateData.currentlyUsedVersion = latestRelease.tagName;
      }

      // Calculate if update is available
      const currentVersion = repo.currentlyUsedVersion || latestRelease.tagName;
      updateData.updateAvailable = currentVersion !== latestRelease.tagName;
    }

      await repo.update(updateData);

      return storedReleases;
    } catch (error) {
      console.error(`Error fetching releases for repo ${repo.fullName}:`, error);
      
      // Update last fetched time even on error
      await repo.update({
        releasesLastFetched: new Date()
      });
      
      throw error;
    }
  }

  /**
   * Get releases for a repository with caching
   * @param {number} repoId - Internal repository ID
   * @param {Object} user - User object
   * @param {boolean} forceRefresh - Force refresh from GitHub
   * @returns {Promise<Array>} Array of releases
   */
  static async getRepositoryReleases(repoId, user, forceRefresh = false) {
    const repo = await Repo.findByPk(repoId);
    if (!repo) {
      throw new Error('Repository not found');
    }

    const shouldRefresh = forceRefresh || 
      !repo.releasesLastFetched || 
      (Date.now() - repo.releasesLastFetched.getTime()) > 24 * 60 * 60 * 1000; // 24 hours

    if (shouldRefresh) {
      await this.fetchAndStoreReleases(repoId, user);
    }

    return await Release.findAll({
      where: { repoId },
      order: [['publishedAt', 'DESC']],
      attributes: ['id', 'tagName', 'name', 'body', 'publishedAt', 'isPrerelease', 'isDraft']
    });
  }

  /**
   * Update user's currently used version for a repository
   * @param {number} repoId - Internal repository ID
   * @param {number} userId - User ID
   * @param {string|null} currentlyUsedVersion - Currently used version tag or null for latest
   * @returns {Promise<Object>} Updated repository
   */
  static async updateCurrentlyUsedVersion(repoId, userId, currentlyUsedVersion) {
    const repo = await Repo.findOne({
      where: { id: repoId, UserId: userId }
    });

    if (!repo) {
      throw new Error('Repository not found or access denied');
    }

    // If repo has no release data yet, try to fetch it
    if (!repo.hasReleases && !repo.releasesLastFetched) {
      try {
        const user = await User.findByPk(userId);
        if (user) {
          await this.fetchAndStoreReleases(repoId, user);
          await repo.reload(); // Reload to get updated data
        }
      } catch (error) {
        // Continue with the update even if release fetch fails
        console.warn(`Failed to fetch releases for repo ${repoId}:`, error.message);
      }
    }

    // If null/empty, use the latest version
    if (!currentlyUsedVersion) {
      currentlyUsedVersion = repo.latestVersion;
    } else {
      // Validate that the selected version exists if provided
      const release = await Release.findOne({
        where: { repoId, tagName: currentlyUsedVersion }
      });

      if (!release) {
        throw new Error('Selected version not found');
      }
    }
    
    // Calculate if update is available
    const updateAvailable = currentlyUsedVersion !== repo.latestVersion;
    
    await repo.update({ currentlyUsedVersion, updateAvailable });
    
    // Reload to get fresh data
    await repo.reload();
    
    return repo;
  }

  /**
   * Get effective version for a repository (currently used version)
   * @param {Object} repo - Repository object
   * @returns {string|null} Effective version tag
   */
  static getEffectiveVersion(repo) {
    return repo.currentlyUsedVersion || repo.latestVersion || null;
  }

  /**
   * Bulk fetch releases for repositories that need updates
   * @param {number} userId - User ID
   * @param {number} limit - Limit number of repos to process
   * @param {Array} repoIds - Optional array of specific repository IDs to fetch
   * @returns {Promise<Object>} Processing results
   */
  static async bulkFetchReleases(userId, limit = 20, repoIds = null) {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Find repositories that need release updates
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    
    const whereCondition = {
      UserId: userId,
      // Either never fetched releases or haven't been updated in 24 hours
      [require('sequelize').Op.or]: [
        { releasesLastFetched: null },
        { releasesLastFetched: { [require('sequelize').Op.lt]: cutoffTime } }
      ]
    };

    // If specific repo IDs are provided, filter to only those
    if (repoIds && repoIds.length > 0) {
      whereCondition.id = { [require('sequelize').Op.in]: repoIds };
    }

    const repos = await Repo.findAll({
      where: whereCondition,
      limit,
      order: [['starredAt', 'DESC']] // Process most recently starred first
    });

    const results = {
      processed: 0,
      successful: 0,
      failed: 0,
      errors: []
    };

    for (const repo of repos) {
      try {
        await this.fetchAndStoreReleases(repo.id, user);
        results.successful++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          repoId: repo.id,
          repoName: repo.fullName,
          error: error.message
        });
      }
      results.processed++;
    }

    return results;
  }
}

module.exports = ReleaseService; 