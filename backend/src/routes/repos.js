const express = require('express');
const { Sequelize } = require('sequelize');
const { Repo, Release } = require('../models');
const { ensureAuth } = require('../middleware/auth');
const ReleaseService = require('../services/releaseService');
const axios = require('axios');

const router = express.Router();

const README_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const README_CACHE_MAX_SIZE = 1000; // Maximum number of cached READMEs

/**
 * Simple LRU cache implementation for README content.
 * Uses a Map which maintains insertion order, allowing O(1) operations.
 */
class LRUCache {
  constructor(maxSize, ttlMs) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.cache = new Map();
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // Check if expired
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      return undefined;
    }

    // Move to end (most recently used) by re-inserting
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.content;
  }

  set(key, content) {
    // Remove existing entry if present (to update position)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict oldest entries if at capacity (first entries are oldest due to Map order)
    while (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      content,
      expiresAt: Date.now() + this.ttlMs
    });
  }

  has(key) {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  // Get content even if expired (for fallback on errors)
  getStale(key) {
    const entry = this.cache.get(key);
    return entry ? entry.content : undefined;
  }
}

const readmeCache = new LRUCache(README_CACHE_MAX_SIZE, README_CACHE_TTL_MS);

// Get repos with pagination
router.get('/repos', ensureAuth, async (req, res) => {
  try {
    const { 
      tags, 
      sort = 'starredAt',
      order = 'desc'
    } = req.query;
    
    let where = { UserId: req.user.id };
    // Parse tags query parameter
    const tagFilters = tags ? tags.split(',') : [];
    
    // Build where clause based on filters
    if (tags) {
      where[Sequelize.Op.or] = [
        // Match custom tags
        { customTags: { [Sequelize.Op.overlap]: tagFilters } },
        // Match language
        { language: { [Sequelize.Op.in]: tagFilters } },
        // Match topics
        { topics: { [Sequelize.Op.overlap]: tagFilters } }
      ];
    }
    
    const repos = await Repo.findAll({
      where,
      order: [[sort, order.toUpperCase()]],
      include: [{
        model: Release,
        required: false,
        attributes: ['tagName', 'name', 'body', 'publishedAt', 'isPrerelease', 'isDraft'],
        limit: 1,
        order: [['publishedAt', 'DESC']]
      }]
    });
    
    res.json({
      repos: repos.map(repo => {
        const repoData = repo.get({ plain: true });
        return {
          ...repoData,
          customTags: repo.customTags || [],
          effectiveVersion: ReleaseService.getEffectiveVersion(repo),
          latestRelease: repoData.Releases && repoData.Releases[0] ? repoData.Releases[0] : null,
          Releases: undefined // Remove the raw Releases array from response
        };
      })
    });
  } catch (error) {
    console.error('Error fetching repos:', error);
    res.status(500).json({ error: 'Failed to fetch repositories' });
  }
});

// Get all unique custom tags for current user
router.get('/custom-tags', ensureAuth, async (req, res) => {
  try {
    const repos = await Repo.findAll({
      attributes: ['customTags'],
      where: {
        UserId: req.user.id,
        customTags: { [Sequelize.Op.ne]: [] }
      }
    });
    const uniqueTags = [...new Set(repos.flatMap(repo => repo.customTags))];
    res.json(uniqueTags);
  } catch (error) {
    console.error('Error fetching custom tags:', error);
    res.status(500).json({ error: 'Failed to fetch custom tags' });
  }
});

// Fetch README for a specific repository
router.get('/repos/:owner/:repo/readme', ensureAuth, async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const refresh = req.query.refresh === 'true';
    const cacheKey = `${req.user.id}:${owner}/${repo}`;

    if (!refresh) {
      const cached = readmeCache.get(cacheKey);
      if (cached) {
        return res.send(cached);
      }
    }

    const response = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}/readme`,
      {
        timeout: 8000,
        headers: {
          Accept: 'application/vnd.github.raw',
          Authorization: `token ${req.user.accessToken}`,
          'User-Agent': 'Node.js'
        }
      }
    );

    readmeCache.set(cacheKey, response.data);
    res.send(response.data);
  } catch (error) {
    console.error('Error fetching README:', error);

    const cacheKey = `${req.user.id}:${req.params.owner}/${req.params.repo}`;
    const cached = readmeCache.getStale(cacheKey);
    if (cached) {
      return res.send(cached);
    }

    res.status(404).json({ error: 'README not found' });
  }
});

// Get repo details (this needs to be after the more specific readme route)
router.get('/repos/:owner/:name', ensureAuth, async (req, res) => {
  try {
    const { owner, name } = req.params;
    
    // Get repo details from GitHub API
    const response = await axios.get(`https://api.github.com/repos/${owner}/${name}`, {
      headers: {
        Authorization: `token ${req.user.accessToken}`,
        'User-Agent': 'Node.js'
      }
    });

    // Make sure to include defaultBranch in the response
    res.json({
      ...response.data,
      defaultBranch: response.data.default_branch // GitHub uses snake_case
    });
  } catch (error) {
    console.error('Error fetching repo details:', error);
    res.status(500).json({ error: 'Failed to fetch repo details' });
  }
});

router.post('/sync', ensureAuth, async (req, res) => {
  try {
    const response = await axios.get('https://api.github.com/user/starred', {
      headers: {
        Authorization: `token ${req.user.accessToken}`,
        'User-Agent': 'Node.js'
      }
    });

    const starredRepos = response.data;
    const starredRepoIds = new Set(starredRepos.map(repo => repo.id));

    // Update existing repos
    const existingRepos = await Repo.findAll({
      where: { UserId: req.user.id }
    });

    // Mark unfollowed repos
    for (const repo of existingRepos) {
      if (!starredRepoIds.has(repo.githubId)) {
        await repo.update({ isFollowed: false });
      } else {
        await repo.update({ isFollowed: true });
      }
    }

    // Add new repos
    for (const repo of starredRepos) {
      const existingRepo = await Repo.findOne({
        where: {
          githubId: repo.id,
          UserId: req.user.id
        }
      });

      await Repo.upsert({
        customTags: existingRepo ? existingRepo.customTags : [],
        githubId: repo.id,
        name: repo.name,
        owner: repo.owner.login,
        description: repo.description,
        language: repo.language,
        stargazersCount: repo.stargazers_count,
        topics: repo.topics,
        starredAt: new Date(),
        UserId: req.user.id,
        isFollowed: true
      });
    }

    res.json({ message: 'Sync completed' });
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ error: 'Failed to sync repositories' });
  }
});

// Update the tags endpoint to handle both add and delete
router.post('/repos/:id/tags', ensureAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ error: 'Invalid repository ID' });
    }

    const { tags, action = 'add' } = req.body;
    
    const repo = await Repo.findOne({
      where: { 
        id: parseInt(id),
        UserId: req.user.id
      }
    });

    if (!repo) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    // Validate input
    if (typeof tags !== 'string') {
      return res.status(400).json({ error: 'Tags must be a string' });
    }

    const existingTags = Array.isArray(repo.customTags) ? repo.customTags : [];
    const tagToProcess = tags.trim();

    let updatedTags;
    if (action === 'delete') {
      // Remove the tag
      updatedTags = existingTags.filter(tag => tag !== tagToProcess);
    } else {
      // Add new tags (default behavior)
      const newTags = tagToProcess.split(/\s+/).filter(Boolean);
      updatedTags = [...new Set([...existingTags, ...newTags])];
    }

    await repo.update({ 
      customTags: updatedTags 
    });

    res.json({ 
      tags: updatedTags,
      id: repo.id
    });
  } catch (error) {
    console.error('Error updating tags:', error);
    res.status(500).json({ error: 'Failed to update tags' });
  }
});

// DELETE endpoint for removing tags
router.delete('/repos/:id/tags', ensureAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ error: 'Invalid repository ID' });
    }

    const { tags } = req.body;
    
    const repo = await Repo.findOne({
      where: { 
        id: parseInt(id),
        UserId: req.user.id
      }
    });

    if (!repo) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    // Validate input
    if (typeof tags !== 'string') {
      return res.status(400).json({ error: 'Tags must be a string' });
    }

    const existingTags = Array.isArray(repo.customTags) ? repo.customTags : [];
    const tagToRemove = tags.trim();

    // Remove the tag
    const updatedTags = existingTags.filter(tag => tag !== tagToRemove);

    await repo.update({ 
      customTags: updatedTags 
    });

    res.json({ 
      tags: updatedTags,
      id: repo.id
    });
  } catch (error) {
    console.error('Error removing tag:', error);
    res.status(500).json({ error: 'Failed to remove tag' });
  }
});

// Add new endpoint for tag counts
router.get('/tags/counts', ensureAuth, async (req, res) => {
  try {
    const repos = await Repo.findAll({
      where: { 
        UserId: req.user.id
      },
      attributes: [
        'id',
        'customTags',
        'topics',
        'language'
      ],
      raw: true
    });

    const tagCount = new Map();
    
    repos.forEach(repo => {
      // Ensure customTags is an array
      const customTags = Array.isArray(repo.customTags) ? repo.customTags : [];
      customTags.forEach(tag => {
        tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
      });
      
      // Ensure topics is an array
      const topics = Array.isArray(repo.topics) ? repo.topics : [];
      topics.forEach(topic => {
        tagCount.set(topic, (tagCount.get(topic) || 0) + 1);
      });
      
      // Count languages
      if (repo.language) {
        tagCount.set(repo.language, (tagCount.get(repo.language) || 0) + 1);
      }
    });

    const counts = Array.from(tagCount.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);

    //console.log('Tag counts:', counts); // Debug log
    res.json(counts);
  } catch (error) {
    console.error('Error getting tag counts:', error.message, error.stack);
    res.status(500).json({ error: 'Failed to get tag counts' });
  }
});

module.exports = router; 
