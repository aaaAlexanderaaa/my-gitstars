const express = require('express');
const { Sequelize, Op } = require('sequelize');
const { Repo, sequelize } = require('../models');
const { ensureAuth } = require('../middleware/auth');
const ReleaseService = require('../services/releaseService');
const axios = require('axios');
const { getProxyConfig } = require('../config/proxy');
const { normalizeTags, MAX_TAGS_PER_REPO } = require('../lib/tags');

// Shared outbound proxy agent + axios defaults (no-op when no proxy is configured).
const proxyAgent = getProxyConfig();
if (proxyAgent) {
  // Disable axios' built-in proxy handling and route HTTPS via our agent instead;
  // its native proxy option has known issues with TLS targets.
  axios.defaults.httpsAgent = proxyAgent;
  axios.defaults.proxy = false;
}

const router = express.Router();

const README_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const README_CACHE_MAX_SIZE = 1000; // Maximum number of cached READMEs
const GITHUB_TIMEOUT_MS = 10000;
const MAX_BULK_REPOS = 2000;
const MAX_NOTE_LENGTH = 20000;

const ALLOWED_REPO_SORTS = new Set([
  'starredAt',
  'stargazersCount',
  'name',
  'fullName',
  'forksCount',
  'pushedAt',
  'githubUpdatedAt'
]);
const ALLOWED_SORT_ORDERS = new Set(['asc', 'desc']);

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

  deleteByPrefix(prefix) {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) this.cache.delete(key);
    }
  }
}

const readmeCache = new LRUCache(README_CACHE_MAX_SIZE, README_CACHE_TTL_MS);

const isTruthyParam = (value) => value === 'true' || value === '1';

function parseId(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 && String(parsed) === String(value).trim()
    ? parsed
    : null;
}

function serializeRepo(repo) {
  const repoData = repo.get ? repo.get({ plain: true }) : repo;
  return {
    ...repoData,
    customTags: repoData.customTags || [],
    topics: repoData.topics || [],
    effectiveVersion: ReleaseService.getEffectiveVersion(repoData)
  };
}

// Get repos with filtering and sorting
router.get('/repos', ensureAuth, async (req, res) => {
  try {
    const {
      tags,
      sort = 'starredAt',
      order = 'desc',
      includeUnfollowed,
      onlyUnfollowed,
      updateAvailable,
      archived,
      fork
    } = req.query;

    const normalizedSort = ALLOWED_REPO_SORTS.has(sort) ? sort : 'starredAt';
    const normalizedOrder = typeof order === 'string' && ALLOWED_SORT_ORDERS.has(order.toLowerCase())
      ? order.toUpperCase()
      : 'DESC';

    const where = { UserId: req.user.id };

    // Repos the user un-starred are kept (they hold tags and notes) but hidden by default.
    if (isTruthyParam(onlyUnfollowed)) {
      where.isFollowed = false;
    } else if (!isTruthyParam(includeUnfollowed)) {
      where.isFollowed = true;
    }

    if (updateAvailable !== undefined) where.updateAvailable = isTruthyParam(updateAvailable);
    if (archived !== undefined) where.archived = isTruthyParam(archived);
    if (fork !== undefined) where.fork = isTruthyParam(fork);

    // Parse tags query parameter
    const tagFilters = typeof tags === 'string' && tags
      ? tags.split(',').map(tag => tag.trim()).filter(Boolean)
      : [];

    // Build where clause based on filters
    if (tagFilters.length > 0) {
      where[Op.or] = [
        // Match custom tags
        { customTags: { [Op.overlap]: tagFilters } },
        // Match language
        { language: { [Op.in]: tagFilters } },
        // Match topics
        { topics: { [Op.overlap]: tagFilters } }
      ];
    }

    // No Release include here on purpose. A hasMany include carrying `limit: 1` makes
    // Sequelize switch to a "grouped limit", which emits one UNION ALL branch per
    // parent row - a several-thousand-branch query for a large account. The columns
    // the dashboard needs (latestVersion, currentlyUsedVersion, updateAvailable) live
    // on Repo itself, and full release lists are fetched per repo by /api/releases.
    const repos = await Repo.findAll({
      where,
      // NULLS LAST keeps repos that have never been pushed/starred out of the way.
      order: [[normalizedSort, `${normalizedOrder} NULLS LAST`]]
    });

    res.json({ repos: repos.map(serializeRepo) });
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
        customTags: { [Op.ne]: [] }
      },
      raw: true
    });
    const uniqueTags = [...new Set(repos.flatMap(repo => repo.customTags || []))].sort((a, b) =>
      a.localeCompare(b)
    );
    res.json(uniqueTags);
  } catch (error) {
    console.error('Error fetching custom tags:', error);
    res.status(500).json({ error: 'Failed to fetch custom tags' });
  }
});

// Add new endpoint for tag counts
router.get('/tags/counts', ensureAuth, async (req, res) => {
  try {
    const repos = await Repo.findAll({
      where: {
        UserId: req.user.id,
        isFollowed: true
      },
      attributes: ['id', 'customTags', 'topics', 'language'],
      raw: true
    });

    const tagCount = new Map();
    const bump = (key) => tagCount.set(key, (tagCount.get(key) || 0) + 1);

    repos.forEach(repo => {
      (Array.isArray(repo.customTags) ? repo.customTags : []).forEach(bump);
      (Array.isArray(repo.topics) ? repo.topics : []).forEach(bump);
      if (repo.language) bump(repo.language);
    });

    const counts = Array.from(tagCount.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

    res.json(counts);
  } catch (error) {
    console.error('Error getting tag counts:', error.message, error.stack);
    res.status(500).json({ error: 'Failed to get tag counts' });
  }
});

/**
 * Export every piece of data the user created by hand, so a database loss (or a move
 * to another instance) does not mean re-tagging thousands of repositories.
 */
router.get('/export', ensureAuth, async (req, res) => {
  try {
    const repos = await Repo.findAll({
      where: { UserId: req.user.id },
      attributes: [
        'githubId', 'fullName', 'customTags', 'notes',
        'currentlyUsedVersion', 'isFollowed', 'starredAt'
      ],
      order: [['fullName', 'ASC']],
      raw: true
    });

    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      username: req.user.username,
      repositories: repos
        .filter(repo => (repo.customTags && repo.customTags.length > 0) || repo.notes || repo.currentlyUsedVersion)
        .map(repo => ({
          githubId: repo.githubId,
          fullName: repo.fullName,
          customTags: repo.customTags || [],
          notes: repo.notes || null,
          currentlyUsedVersion: repo.currentlyUsedVersion || null,
          isFollowed: repo.isFollowed
        }))
    };

    res.setHeader('Content-Disposition', `attachment; filename="gitstars-${req.user.username || 'export'}.json"`);
    res.json(payload);
  } catch (error) {
    console.error('Error exporting data:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

/**
 * Restore an export. Matched by githubId first, then fullName, so an export taken
 * before a repository was renamed still applies.
 */
router.post('/import', ensureAuth, async (req, res) => {
  try {
    const { repositories, mode = 'merge' } = req.body || {};
    if (!Array.isArray(repositories)) {
      return res.status(400).json({ error: 'Expected a "repositories" array' });
    }
    if (repositories.length > MAX_BULK_REPOS) {
      return res.status(400).json({ error: `Import is limited to ${MAX_BULK_REPOS} repositories` });
    }
    if (!['merge', 'replace'].includes(mode)) {
      return res.status(400).json({ error: 'mode must be "merge" or "replace"' });
    }

    const owned = await Repo.findAll({
      where: { UserId: req.user.id },
      attributes: ['id', 'githubId', 'fullName', 'customTags', 'notes', 'currentlyUsedVersion']
    });
    const byGithubId = new Map(owned.map(repo => [String(repo.githubId), repo]));
    const byFullName = new Map(owned.filter(r => r.fullName).map(repo => [repo.fullName.toLowerCase(), repo]));

    const results = { updated: 0, skipped: 0, notFound: [], invalid: [] };

    await sequelize.transaction(async (t) => {
      for (const entry of repositories) {
        if (!entry || typeof entry !== 'object') {
          results.skipped++;
          continue;
        }

        const repo = byGithubId.get(String(entry.githubId)) ||
          (typeof entry.fullName === 'string' ? byFullName.get(entry.fullName.toLowerCase()) : undefined);

        if (!repo) {
          results.notFound.push(entry.fullName || entry.githubId || 'unknown');
          continue;
        }

        const patch = {};

        if (entry.customTags !== undefined) {
          const incoming = Array.isArray(entry.customTags) ? entry.customTags : [];
          const validated = incoming.length > 0 ? normalizeTags(incoming) : { tags: [] };
          if (validated.error) {
            results.invalid.push({ repo: repo.fullName, error: validated.error });
            continue;
          }
          patch.customTags = mode === 'replace'
            ? validated.tags
            : [...new Set([...(repo.customTags || []), ...validated.tags])].slice(0, MAX_TAGS_PER_REPO);
        }

        if (typeof entry.notes === 'string' && entry.notes.length <= MAX_NOTE_LENGTH) {
          if (mode === 'replace' || !repo.notes) patch.notes = entry.notes;
        }

        if (typeof entry.currentlyUsedVersion === 'string' && entry.currentlyUsedVersion) {
          if (mode === 'replace' || !repo.currentlyUsedVersion) {
            patch.currentlyUsedVersion = entry.currentlyUsedVersion;
          }
        }

        if (Object.keys(patch).length === 0) {
          results.skipped++;
          continue;
        }

        await repo.update(patch, { transaction: t });
        results.updated++;
      }
    });

    res.json(results);
  } catch (error) {
    console.error('Error importing data:', error);
    res.status(500).json({ error: 'Failed to import data' });
  }
});

// Fetch README for a specific repository
router.get('/repos/:owner/:repo/readme', ensureAuth, async (req, res) => {
  const { owner, repo } = req.params;
  const cacheKey = `${req.user.id}:${owner}/${repo}`;

  try {
    const refresh = isTruthyParam(req.query.refresh);

    if (!refresh) {
      const cached = readmeCache.get(cacheKey);
      if (cached) {
        res.type('text/plain; charset=utf-8');
        return res.send(cached);
      }
    }

    const response = await axios.get(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme`,
      {
        timeout: GITHUB_TIMEOUT_MS,
        headers: {
          Accept: 'application/vnd.github.raw',
          Authorization: `token ${req.user.accessToken}`,
          'User-Agent': 'my-gitstars'
        }
      }
    );

    readmeCache.set(cacheKey, response.data);
    res.type('text/plain; charset=utf-8');
    res.send(response.data);
  } catch (error) {
    const status = error.response?.status;
    // A missing README is normal; anything else is worth a log line.
    if (status !== 404) {
      console.error(`Error fetching README for ${owner}/${repo}:`, error.message);
    }

    const cached = readmeCache.getStale(cacheKey);
    if (cached) {
      res.type('text/plain; charset=utf-8');
      return res.send(cached);
    }

    res.status(status === 404 ? 404 : 502).json({
      error: status === 404 ? 'README not found' : 'Failed to fetch README from GitHub'
    });
  }
});

// Get repo details (this needs to be after the more specific readme route)
router.get('/repos/:owner/:name', ensureAuth, async (req, res) => {
  try {
    const { owner, name } = req.params;

    const response = await axios.get(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
      {
        timeout: GITHUB_TIMEOUT_MS,
        headers: {
          Authorization: `token ${req.user.accessToken}`,
          'User-Agent': 'my-gitstars'
        }
      }
    );

    // Make sure to include defaultBranch in the response
    res.json({
      ...response.data,
      defaultBranch: response.data.default_branch // GitHub uses snake_case
    });
  } catch (error) {
    const status = error.response?.status;
    console.error('Error fetching repo details:', error.message);
    res.status(status === 404 ? 404 : 502).json({ error: 'Failed to fetch repo details' });
  }
});

async function findOwnedRepo(req, res) {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: 'Invalid repository ID' });
    return null;
  }

  const repo = await Repo.findOne({ where: { id, UserId: req.user.id } });
  if (!repo) {
    res.status(404).json({ error: 'Repository not found' });
    return null;
  }
  return repo;
}

// Add tags to a repository (also supports removal via action: 'delete')
router.post('/repos/:id/tags', ensureAuth, async (req, res) => {
  try {
    const repo = await findOwnedRepo(req, res);
    if (!repo) return;

    const { tags, action = 'add' } = req.body || {};
    if (!['add', 'delete'].includes(action)) {
      return res.status(400).json({ error: 'action must be "add" or "delete"' });
    }

    const validated = normalizeTags(tags);
    if (validated.error) {
      return res.status(400).json({ error: validated.error });
    }

    const existingTags = Array.isArray(repo.customTags) ? repo.customTags : [];

    let updatedTags;
    if (action === 'delete') {
      updatedTags = existingTags.filter(tag => !validated.tags.includes(tag));
    } else {
      updatedTags = [...new Set([...existingTags, ...validated.tags])];
      if (updatedTags.length > MAX_TAGS_PER_REPO) {
        return res.status(400).json({ error: `A repository can hold at most ${MAX_TAGS_PER_REPO} tags` });
      }
    }

    await repo.update({ customTags: updatedTags });

    res.json({ tags: updatedTags, id: repo.id });
  } catch (error) {
    console.error('Error updating tags:', error);
    res.status(500).json({ error: 'Failed to update tags' });
  }
});

// DELETE endpoint for removing tags
router.delete('/repos/:id/tags', ensureAuth, async (req, res) => {
  try {
    const repo = await findOwnedRepo(req, res);
    if (!repo) return;

    const validated = normalizeTags(req.body?.tags);
    if (validated.error) {
      return res.status(400).json({ error: validated.error });
    }

    const existingTags = Array.isArray(repo.customTags) ? repo.customTags : [];
    const updatedTags = existingTags.filter(tag => !validated.tags.includes(tag));

    await repo.update({ customTags: updatedTags });

    res.json({ tags: updatedTags, id: repo.id });
  } catch (error) {
    console.error('Error removing tag:', error);
    res.status(500).json({ error: 'Failed to remove tag' });
  }
});

/**
 * Apply one tag to (or remove it from) many repositories in a single request.
 * The dashboard used to fire one request per repository, which meant hundreds of
 * round-trips and a half-applied result if the tab was closed mid-way.
 */
router.post('/repos/bulk-tags', ensureAuth, async (req, res) => {
  try {
    const { repoIds, tags, action = 'add' } = req.body || {};

    if (!Array.isArray(repoIds) || repoIds.length === 0) {
      return res.status(400).json({ error: 'repoIds must be a non-empty array' });
    }
    if (repoIds.length > MAX_BULK_REPOS) {
      return res.status(400).json({ error: `At most ${MAX_BULK_REPOS} repositories per request` });
    }
    if (!['add', 'delete'].includes(action)) {
      return res.status(400).json({ error: 'action must be "add" or "delete"' });
    }

    const ids = repoIds.map(parseId);
    if (ids.some(id => id === null)) {
      return res.status(400).json({ error: 'repoIds must all be positive integers' });
    }

    const validated = normalizeTags(tags);
    if (validated.error) {
      return res.status(400).json({ error: validated.error });
    }

    const updated = [];
    await sequelize.transaction(async (t) => {
      const repos = await Repo.findAll({
        where: { id: { [Op.in]: ids }, UserId: req.user.id },
        transaction: t
      });

      for (const repo of repos) {
        const existing = Array.isArray(repo.customTags) ? repo.customTags : [];
        const next = action === 'delete'
          ? existing.filter(tag => !validated.tags.includes(tag))
          : [...new Set([...existing, ...validated.tags])].slice(0, MAX_TAGS_PER_REPO);

        if (next.length === existing.length && next.every((tag, i) => tag === existing[i])) {
          continue;
        }

        await repo.update({ customTags: next }, { transaction: t });
        updated.push({ id: repo.id, tags: next });
      }
    });

    res.json({ action, tags: validated.tags, updated, updatedCount: updated.length });
  } catch (error) {
    console.error('Error applying bulk tags:', error);
    res.status(500).json({ error: 'Failed to apply tags' });
  }
});

/**
 * Rename a custom tag everywhere. Typos in a tag applied to 300 repositories were
 * previously only fixable one repository at a time.
 */
router.patch('/tags/:tag', ensureAuth, async (req, res) => {
  try {
    const from = req.params.tag;
    const validatedFrom = normalizeTags([from]);
    const validatedTo = normalizeTags([req.body?.tag]);

    if (validatedFrom.error) return res.status(400).json({ error: validatedFrom.error });
    if (validatedTo.error) return res.status(400).json({ error: validatedTo.error });

    const oldTag = validatedFrom.tags[0];
    const newTag = validatedTo.tags[0];

    if (oldTag === newTag) {
      return res.json({ from: oldTag, to: newTag, updatedCount: 0 });
    }

    let updatedCount = 0;
    await sequelize.transaction(async (t) => {
      const repos = await Repo.findAll({
        where: { UserId: req.user.id, customTags: { [Op.contains]: [oldTag] } },
        transaction: t
      });

      for (const repo of repos) {
        const next = [...new Set((repo.customTags || []).map(tag => (tag === oldTag ? newTag : tag)))];
        await repo.update({ customTags: next }, { transaction: t });
        updatedCount++;
      }
    });

    res.json({ from: oldTag, to: newTag, updatedCount });
  } catch (error) {
    console.error('Error renaming tag:', error);
    res.status(500).json({ error: 'Failed to rename tag' });
  }
});

// Remove a custom tag from every repository it is on.
router.delete('/tags/:tag', ensureAuth, async (req, res) => {
  try {
    const validated = normalizeTags([req.params.tag]);
    if (validated.error) return res.status(400).json({ error: validated.error });
    const tag = validated.tags[0];

    let updatedCount = 0;
    await sequelize.transaction(async (t) => {
      const repos = await Repo.findAll({
        where: { UserId: req.user.id, customTags: { [Op.contains]: [tag] } },
        transaction: t
      });

      for (const repo of repos) {
        await repo.update(
          { customTags: (repo.customTags || []).filter(current => current !== tag) },
          { transaction: t }
        );
        updatedCount++;
      }
    });

    res.json({ tag, updatedCount });
  } catch (error) {
    console.error('Error deleting tag:', error);
    res.status(500).json({ error: 'Failed to delete tag' });
  }
});

// Free-form note per repository.
router.put('/repos/:id/notes', ensureAuth, async (req, res) => {
  try {
    const repo = await findOwnedRepo(req, res);
    if (!repo) return;

    const { notes } = req.body || {};
    if (notes !== null && typeof notes !== 'string') {
      return res.status(400).json({ error: 'notes must be a string or null' });
    }
    if (typeof notes === 'string' && notes.length > MAX_NOTE_LENGTH) {
      return res.status(400).json({ error: `Notes are limited to ${MAX_NOTE_LENGTH} characters` });
    }

    const value = typeof notes === 'string' && notes.trim() === '' ? null : notes;
    await repo.update({ notes: value });

    res.json({ id: repo.id, notes: value });
  } catch (error) {
    console.error('Error saving notes:', error);
    res.status(500).json({ error: 'Failed to save notes' });
  }
});

/**
 * Permanently drop repositories the user no longer stars. Sync only marks them
 * unfollowed so tags and notes survive an accidental un-star; this is the explicit
 * opt-in cleanup.
 */
router.delete('/repos/unfollowed', ensureAuth, async (req, res) => {
  try {
    const deleted = await Repo.destroy({
      where: { UserId: req.user.id, isFollowed: false }
    });
    readmeCache.deleteByPrefix(`${req.user.id}:`);
    res.json({ deleted });
  } catch (error) {
    console.error('Error pruning unfollowed repos:', error);
    res.status(500).json({ error: 'Failed to prune unfollowed repositories' });
  }
});

/**
 * Aggregate numbers for the dashboard header. Computed in Postgres so it stays cheap
 * for accounts with thousands of stars.
 */
router.get('/stats', ensureAuth, async (req, res) => {
  try {
    const [row] = await Repo.findAll({
      where: { UserId: req.user.id },
      attributes: [
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'total'],
        [Sequelize.fn('COUNT', Sequelize.literal('CASE WHEN is_followed THEN 1 END')), 'followed'],
        [Sequelize.fn('COUNT', Sequelize.literal('CASE WHEN NOT is_followed THEN 1 END')), 'unfollowed'],
        [Sequelize.fn('COUNT', Sequelize.literal('CASE WHEN update_available AND is_followed THEN 1 END')), 'updatesAvailable'],
        [Sequelize.fn('COUNT', Sequelize.literal('CASE WHEN archived AND is_followed THEN 1 END')), 'archived'],
        [Sequelize.fn('COUNT', Sequelize.literal("CASE WHEN is_followed AND (tags IS NULL OR cardinality(tags) = 0) THEN 1 END")), 'untagged'],
        [Sequelize.fn('SUM', Sequelize.literal('CASE WHEN is_followed THEN stargazers_count ELSE 0 END')), 'totalStars']
      ],
      raw: true
    });

    const toNumber = (value) => Number(value || 0);
    res.json({
      total: toNumber(row.total),
      followed: toNumber(row.followed),
      unfollowed: toNumber(row.unfollowed),
      updatesAvailable: toNumber(row.updatesAvailable),
      archived: toNumber(row.archived),
      untagged: toNumber(row.untagged),
      totalStars: toNumber(row.totalStars)
    });
  } catch (error) {
    console.error('Error computing stats:', error);
    res.status(500).json({ error: 'Failed to compute stats' });
  }
});

module.exports = router;
