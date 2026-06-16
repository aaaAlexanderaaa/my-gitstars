const express = require('express');
const ReleaseService = require('../services/releaseService');
const { Repo } = require('../models');
const router = express.Router();

function parseRepoId(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && String(parsed) === String(value) ? parsed : null;
}

// Middleware to ensure user is authenticated
const requireAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};

// Get releases for a specific repository
router.get('/repo/:repoId', requireAuth, async (req, res) => {
  try {
    const { repoId } = req.params;
    const { refresh } = req.query;
    const parsedRepoId = parseRepoId(repoId);
    if (parsedRepoId === null) {
      return res.status(400).json({
        success: false,
        error: 'Invalid repository ID'
      });
    }

    const repo = await Repo.findOne({
      where: { id: parsedRepoId, UserId: req.user.id }
    });

    if (!repo) {
      return res.status(404).json({
        success: false,
        error: 'Repository not found'
      });
    }

    const releases = await ReleaseService.getRepositoryReleases(
      repo.id,
      req.user,
      refresh === 'true'
    );

    await repo.reload();

    res.json({
      success: true,
      releases,
      repo: {
        id: repo.id,
        latestVersion: repo.latestVersion,
        currentlyUsedVersion: repo.currentlyUsedVersion,
        updateAvailable: repo.updateAvailable,
        hasReleases: repo.hasReleases,
        releasesLastFetched: repo.releasesLastFetched
      }
    });
  } catch (error) {
    console.error('Error fetching repository releases:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Get release notes for versions newer than current version
router.get('/repo/:repoId/newer-versions', requireAuth, async (req, res) => {
  try {
    const { repoId } = req.params;
    const { Repo, Release } = require('../models');
    const parsedRepoId = parseRepoId(repoId);
    if (parsedRepoId === null) {
      return res.status(400).json({
        success: false,
        error: 'Invalid repository ID'
      });
    }

    // Get the repository with current version info
    const repo = await Repo.findOne({
      where: { id: parsedRepoId, UserId: req.user.id }
    });

    if (!repo) {
      return res.status(404).json({
        success: false,
        error: 'Repository not found'
      });
    }

    if (!repo.hasReleases || !repo.currentlyUsedVersion) {
      return res.json({
        success: true,
        releases: []
      });
    }

    // Get all releases for this repo
    const allReleases = await Release.findAll({
      where: { repoId: parsedRepoId },
      order: [['publishedAt', 'ASC']], // Oldest first for proper ordering
      attributes: ['id', 'tagName', 'name', 'body', 'publishedAt', 'isPrerelease', 'isDraft']
    });

    // Find the index of the current version
    const currentVersionIndex = allReleases.findIndex(
      release => release.tagName === repo.currentlyUsedVersion
    );

    // Get releases newer than the current version (chronologically later)
    const newerReleases = currentVersionIndex >= 0
      ? allReleases.slice(currentVersionIndex + 1)
      : allReleases; // If current version not found, show all releases

    res.json({
      success: true,
      releases: newerReleases,
      currentVersion: repo.currentlyUsedVersion
    });
  } catch (error) {
    console.error('Error fetching newer versions:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Update currently used version for a repository
router.patch('/repo/:repoId/version', requireAuth, async (req, res) => {
  try {
    const { repoId } = req.params;
    // Accept both field names for backward compatibility
    const { currentlyUsedVersion, selectedVersion } = req.body;
    const versionToUse = currentlyUsedVersion || selectedVersion;
    const parsedRepoId = parseRepoId(repoId);
    if (parsedRepoId === null) {
      return res.status(400).json({
        success: false,
        error: 'Invalid repository ID'
      });
    }

    const repo = await ReleaseService.updateCurrentlyUsedVersion(
      parsedRepoId,
      req.user.id,
      versionToUse || null
    );

    res.json({
      success: true,
      repo: {
        id: repo.id,
        latestVersion: repo.latestVersion,
        currentlyUsedVersion: repo.currentlyUsedVersion,
        updateAvailable: repo.updateAvailable,
        effectiveVersion: ReleaseService.getEffectiveVersion(repo)
      }
    });
  } catch (error) {
    console.error('Error updating currently used version:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Bulk fetch releases for user's repositories
router.post('/bulk-fetch', requireAuth, async (req, res) => {
  try {
    const { limit = 20, repoIds = null } = req.body;
    const parsedLimit = Number.parseInt(limit, 10);
    const safeLimit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : 20;

    let safeRepoIds = null;
    if (repoIds !== null && repoIds !== undefined) {
      if (!Array.isArray(repoIds)) {
        return res.status(400).json({
          success: false,
          error: 'repoIds must be an array'
        });
      }

      safeRepoIds = repoIds.map(parseRepoId);
      if (safeRepoIds.some(id => id === null)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid repository ID'
        });
      }
    }

    const results = await ReleaseService.bulkFetchReleases(req.user.id, safeLimit, safeRepoIds);

    res.json({
      success: true,
      results
    });
  } catch (error) {
    console.error('Error in bulk release fetch:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
