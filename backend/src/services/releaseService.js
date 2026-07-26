const { Repo, Release, User } = require('../models');
const GitHubService = require('./githubService');
const { Op } = require('sequelize');

const DAY_MS = 24 * 60 * 60 * 1000;
const BULK_FETCH_DELAY_MS = 1000; // 1 second delay between repos in bulk fetch
const MAX_BULK_FETCH_LIMIT = 50; // Maximum repos to process in a single bulk fetch (rate limit safety)
// A failed fetch is retried sooner than a successful one instead of being cached for a full day.
const ERROR_RETRY_AFTER_MS = 30 * 60 * 1000; // 30 minutes

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
      // Fetch releases from GitHub. Drafts are only visible to maintainers, are not
      // installable, and (having no publishedAt) used to sort to the top of the list
      // and be offered as a selectable "current version".
      const fetched = (await ghService.getRepositoryReleases(repo.owner, repo.name))
        .filter(release => !release.isDraft);

      // The list endpoint is ordered by created_at; "latest" is defined by published_at.
      const releases = [...fetched].sort(
        (a, b) => (b.publishedAt ? b.publishedAt.getTime() : 0) - (a.publishedAt ? a.publishedAt.getTime() : 0)
      );

      if (releases.length === 0) {
        // No releases found. Also clear the version fields: leaving a stale
        // latestVersion behind kept a repo flagged as having an update forever.
        await repo.update({
          hasReleases: false,
          latestVersion: null,
          updateAvailable: false,
          releasesLastFetched: new Date(),
          releasesFetchError: null
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

      await this.pruneDeletedReleases(repo.id, releases);

      // GitHub's "latest release" is the newest non-draft, non-prerelease. Projects
      // that only ever ship pre-releases have no such release, so fall back to their
      // newest release instead of reporting no version at all.
      const latestStableRelease =
        releases.find(release => !release.isPrerelease) || releases[0] || null;

      const updateData = {
        hasReleases: true,
        releasesLastFetched: new Date(),
        releasesFetchError: null,
        latestVersion: latestStableRelease ? latestStableRelease.tagName : null
      };

      // Adopt the latest version only on the FIRST successful fetch that found
      // releases, so a user's explicit choice is never overwritten later.
      if (!repo.currentlyUsedVersion && !repo.hasReleases && latestStableRelease) {
        updateData.currentlyUsedVersion = latestStableRelease.tagName;
      }

      const currentVersion = repo.currentlyUsedVersion || updateData.currentlyUsedVersion;
      updateData.updateAvailable = !!(
        currentVersion &&
        updateData.latestVersion &&
        currentVersion !== updateData.latestVersion
      );

      await repo.update(updateData);

      return storedReleases;
    } catch (error) {
      console.error(`Error fetching releases for repo ${repo.fullName}:`, error);

      // Back off from the failing repo without pretending the fetch succeeded:
      // stamping the real "last fetched" time here used to cache the failure for 24h.
      await repo.update({
        releasesLastFetched: new Date(Date.now() - (DAY_MS - ERROR_RETRY_AFTER_MS)),
        releasesFetchError: String(error.message || error).slice(0, 500)
      });

      throw error;
    }
  }

  /**
   * Drops rows for releases GitHub no longer returns, so a deleted or un-published
   * release stops showing up as a selectable version.
   *
   * Only the newest page is fetched, so pruning is limited to the window we can see:
   * anything older than the oldest release in the response is left alone.
   */
  static async pruneDeletedReleases(repoId, fetchedReleases) {
    const publishedTimes = fetchedReleases
      .map(release => (release.publishedAt ? release.publishedAt.getTime() : null))
      .filter(time => time !== null);

    if (publishedTimes.length === 0) return 0;

    const oldestFetched = new Date(Math.min(...publishedTimes));
    const keepIds = fetchedReleases.map(release => release.githubReleaseId);

    return Release.destroy({
      where: {
        repoId,
        publishedAt: { [Op.gte]: oldestFetched },
        githubReleaseId: { [Op.notIn]: keepIds }
      }
    });
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
      // Postgres sorts NULLs first on DESC, which used to float releases with no
      // publish date to the top of the changelog.
      order: [['publishedAt', 'DESC NULLS LAST']],
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
    
    // "Not using" (null) means no update. A repo with no known latest version cannot
    // have an update either - comparing against null used to flag one permanently.
    const updateAvailable = !!(
      currentlyUsedVersion &&
      repo.latestVersion &&
      currentlyUsedVersion !== repo.latestVersion
    );

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

    // Don't spend GitHub rate limit on repos the user no longer stars.
    const whereCondition = {
      UserId: userId,
      isFollowed: true
    };

    if (!force) {
      // Either never fetched releases or haven't been updated within the configured window.
      const cutoffTime = new Date(Date.now() - minFetchAgeMs);
      whereCondition[Op.or] = [
        { releasesLastFetched: null },
        { releasesLastFetched: { [Op.lte]: cutoffTime } }
      ];
    }

    // If specific repo IDs are provided, filter to only those. An explicit empty
    // list should match no repos instead of falling back to an unscoped fetch.
    if (Array.isArray(repoIds)) {
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
