const { Repo, Release, User } = require('../models');
const GitHubService = require('./githubService');
const { Op } = require('sequelize');

const DAY_MS = 24 * 60 * 60 * 1000;
const BULK_FETCH_DELAY_MS = 1000; // 1 second delay between repos in bulk fetch
const MAX_BULK_FETCH_LIMIT = 50; // Maximum repos to process in a single bulk fetch (rate limit safety)

// Helper to delay execution
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class ReleaseService {
  /**
   * Fetch and store releases for a specific repository
   * @param {number} repoId - Internal repository ID
   * @param {Object} user - User object with access token
   * @param {GitHubService} [githubService] - Optional shared GitHubService instance for rate limit tracking
   * @returns {Promise<Array>} Array of releases
   */
  static async fetchAndStoreReleases(repoId, user, githubService = null) {
    const repo = await Repo.findByPk(repoId);
    if (!repo) {
      throw new Error('Repository not found');
    }

    if (repo.UserId !== user.id) {
      throw new Error('Repository not found or access denied');
    }

    // Use provided GitHubService or create a new one
    const ghService = githubService || new GitHubService(user.accessToken);

    try {
      // Fetch releases from GitHub
      const releases = await ghService.getRepositoryReleases(repo.owner, repo.name);
      
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
        // Use githubReleaseId as unique key - it's GitHub's stable identifier.
        // Using tagName would cause phantom rows if a release is retagged.
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

        // Update existing release if not created (handles tag renames, content changes)
        if (!created) {
          await release.update(releaseData);
        }

        storedReleases.push(release);
      }

      // Update repository metadata
      // GitHub "latest release" is the most recent non-draft, non-prerelease.
      const latestStableRelease = releases.find(r => !r.isPrerelease && !r.isDraft) || null;
      const updateData = {
        hasReleases: true,
        releasesLastFetched: new Date()
      };

      if (latestStableRelease) {
        updateData.latestVersion = latestStableRelease.tagName;

        // Set currently_used_version to latest only on FIRST successful fetch with releases
        // Use hasReleases (not releasesLastFetched) since releasesLastFetched is set on errors too
        if (!repo.currentlyUsedVersion && !repo.hasReleases) {
          updateData.currentlyUsedVersion = latestStableRelease.tagName;
        }

        // Calculate if update is available (null means "not using", so no update)
        const currentVersion = repo.currentlyUsedVersion || updateData.currentlyUsedVersion;
        updateData.updateAvailable = currentVersion
          ? currentVersion !== latestStableRelease.tagName
          : false;
      } else {
        // No stable "latest" exists per GitHub semantics (only pre-releases/drafts).
        updateData.latestVersion = null;
        updateData.updateAvailable = false;
        if (!repo.currentlyUsedVersion) {
          updateData.currentlyUsedVersion = null;
        }
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

    if (repo.UserId !== user.id) {
      throw new Error('Repository not found or access denied');
    }

    const shouldRefresh = forceRefresh || 
      !repo.releasesLastFetched || 
      (Date.now() - repo.releasesLastFetched.getTime()) > DAY_MS; // 24 hours

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
   * @param {string|null} currentlyUsedVersion - Version tag, or null/empty for "Not using"
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

    // If null/empty is explicitly passed, allow it (user chose "Not using")
    // Only validate if a specific version is provided
    if (currentlyUsedVersion) {
      // Validate that the selected version exists
      const release = await Release.findOne({
        where: { repoId, tagName: currentlyUsedVersion }
      });

      if (!release) {
        throw new Error('Selected version not found');
      }
    }
    
    // Calculate if update is available (null means "not using", so no update available)
    const updateAvailable = currentlyUsedVersion
      ? currentlyUsedVersion !== repo.latestVersion
      : false;
    
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
    // If releases have been fetched, respect the user's explicit choice
    // (null means "Not using" - don't fall back to latestVersion)
    if (repo.hasReleases) {
      return repo.currentlyUsedVersion || null;
    }
    // Releases not yet fetched - fall back to latestVersion as best guess
    return repo.currentlyUsedVersion || repo.latestVersion || null;
  }

  /**
   * Bulk fetch releases for repositories that need updates
   * @param {number} userId - User ID
   * @param {number} limit - Limit number of repos to process (capped at MAX_BULK_FETCH_LIMIT)
   * @param {Array} repoIds - Optional array of specific repository IDs to fetch
   * @param {Object} options - Optional behavior overrides
   * @param {number} options.minFetchAgeMs - Only fetch if last fetch is older than this age (default 24h)
   * @param {boolean} options.force - Fetch regardless of last fetched time
   * @returns {Promise<Object>} Processing results
   */
  static async bulkFetchReleases(userId, limit = 20, repoIds = null, options = {}) {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Enforce maximum limit to prevent rate limit exhaustion
    const effectiveLimit = Math.min(limit, MAX_BULK_FETCH_LIMIT);

    const force = options.force === true;
    const minFetchAgeMs = Number.isFinite(options.minFetchAgeMs) && options.minFetchAgeMs >= 0
      ? options.minFetchAgeMs
      : DAY_MS;

    const whereCondition = {
      UserId: userId
    };

    if (!force) {
      // Either never fetched releases or haven't been updated within the configured window.
      const cutoffTime = new Date(Date.now() - minFetchAgeMs);
      whereCondition[Op.or] = [
        { releasesLastFetched: null },
        { releasesLastFetched: { [Op.lte]: cutoffTime } }
      ];
    }

    // If specific repo IDs are provided, filter to only those
    if (repoIds && repoIds.length > 0) {
      whereCondition.id = { [Op.in]: repoIds };
    }

    const repos = await Repo.findAll({
      where: whereCondition,
      limit: effectiveLimit,
      order: [['releasesLastFetched', 'ASC NULLS FIRST'], ['starredAt', 'DESC']] // Prioritize repos that haven't been fetched recently
    });

    const results = {
      processed: 0,
      successful: 0,
      failed: 0,
      skippedRateLimit: 0,
      errors: []
    };

    // Create a shared GitHubService instance to track rate limits across requests
    const githubService = new GitHubService(user.accessToken);

    for (const repo of repos) {
      // Check rate limit before each request - stop early if running low
      if (githubService.rateLimitRemaining !== null && githubService.rateLimitRemaining < 50) {
        console.log(`[release-service] Stopping bulk fetch early: rate limit low (${githubService.rateLimitRemaining} remaining)`);
        results.skippedRateLimit = repos.length - results.processed;
        break;
      }

      let stopForRateLimit = false;
      try {
        await this.fetchAndStoreReleases(repo.id, user, githubService);
        results.successful++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          repoId: repo.id,
          repoName: repo.fullName,
          error: error.message
        });

        // If we hit a rate limit error, stop processing
        // GitHub returns 403 with specific headers/messages for rate limits, vs other 403s for permissions
        const isRateLimitError =
          error.status === 403 && (
            error.message?.toLowerCase().includes('rate limit') ||
            error.response?.headers?.['x-ratelimit-remaining'] === '0'
          );
        if (isRateLimitError) {
          console.log(`[release-service] Stopping bulk fetch: rate limit hit`);
          stopForRateLimit = true;
        }
      } finally {
        results.processed++;
      }

      if (stopForRateLimit) {
        results.skippedRateLimit = repos.length - results.processed;
        break;
      }

      // Add delay between repos to avoid rate limiting
      if (results.processed < repos.length) {
        await delay(BULK_FETCH_DELAY_MS);
      }
    }

    return results;
  }
}

module.exports = ReleaseService; 
