const { Op } = require('sequelize');
const { User, Repo, SyncStatus } = require('../models');
const SyncService = require('./syncService');
const ReleaseService = require('./releaseService');

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SYNC_FAILURE_BACKOFF_MS = 30 * 60 * 1000; // 30 minutes
const DEFAULT_SYNC_AUTH_FAILURE_BACKOFF_MS = 24 * 60 * 60 * 1000; // 24 hours
const DEFAULT_STARTUP_DELAY_MS = 30 * 1000; // 30 seconds delay before first run

function parseMs(value, fallbackMs) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs;
}

function isLikelyAuthError(errorMessage) {
  const message = String(errorMessage || '');
  return /bad credentials|requires authentication|401/i.test(message);
}

async function getLastCompletedSyncAt(userId) {
  const lastCompleted = await SyncStatus.findOne({
    where: { userId, status: 'completed' },
    order: [['updatedAt', 'DESC']]
  });
  return lastCompleted ? lastCompleted.updatedAt : null;
}

async function getLastFailedSync(userId) {
  const lastFailed = await SyncStatus.findOne({
    where: { userId, status: 'failed' },
    order: [['updatedAt', 'DESC']]
  });
  return lastFailed ? { updatedAt: lastFailed.updatedAt, error: lastFailed.error } : null;
}

async function hasSyncInProgress(userId) {
  return !!(await SyncService.getActiveInProgressSync(userId));
}

async function runStarSyncTick() {
  // Only fetch users with valid access tokens
  const users = await User.findAll({
    attributes: ['id', 'accessToken'],
    where: {
      accessToken: { [Op.ne]: null }
    }
  });
  for (const user of users) {
    const userId = user.id;
    // Skip users without access tokens (logged out or token revoked)
    if (!user.accessToken) continue;

    try {
      if (await hasSyncInProgress(userId)) continue;

      const lastCompletedAt = await getLastCompletedSyncAt(userId);
      const shouldSync = !lastCompletedAt || (Date.now() - lastCompletedAt.getTime()) >= DAY_MS;
      if (!shouldSync) continue;

      const lastFailed = await getLastFailedSync(userId);
      if (lastFailed?.updatedAt) {
        const failureBackoffMs = parseMs(process.env.SYNC_FAILURE_BACKOFF_MS, DEFAULT_SYNC_FAILURE_BACKOFF_MS);
        const authFailureBackoffMs = parseMs(process.env.SYNC_AUTH_FAILURE_BACKOFF_MS, DEFAULT_SYNC_AUTH_FAILURE_BACKOFF_MS);
        const backoffMs = isLikelyAuthError(lastFailed.error) ? authFailureBackoffMs : failureBackoffMs;
        if ((Date.now() - lastFailed.updatedAt.getTime()) < backoffMs) continue;
      }

      await SyncService.syncUserStars(userId);
    } catch (error) {
      // `syncUserStars` only enqueues a background job; GitHub/auth errors happen asynchronously there,
      // so don't treat errors here as token failures.
      console.warn(`[scheduler] star sync tick failed for user ${userId}:`, error.message);
    }
  }
}

async function runVersionTrackingTick(versionTrackingTag, minFetchAgeMs) {
  // Only fetch users with valid access tokens
  const users = await User.findAll({
    attributes: ['id', 'accessToken'],
    where: {
      accessToken: { [Op.ne]: null }
    }
  });
  for (const user of users) {
    const userId = user.id;
    // Skip users without access tokens (logged out or token revoked)
    if (!user.accessToken) continue;

    try {
      if (await hasSyncInProgress(userId)) continue;

      const repos = await Repo.findAll({
        where: {
          UserId: userId,
          isFollowed: true,
          customTags: { [Op.overlap]: [versionTrackingTag] }
        },
        attributes: ['id'],
        raw: true
      });

      const repoIds = repos.map(r => r.id);
      if (repoIds.length === 0) continue;

      await ReleaseService.bulkFetchReleases(userId, repoIds.length, repoIds, { minFetchAgeMs });
    } catch (error) {
      // If we get a 401, the token is invalid - log but don't spam
      if (error.status === 401 || error.message?.includes('401')) {
        console.warn(`[scheduler] version tracking skipped for user ${userId}: invalid/expired token`);
      } else {
        console.warn(`[scheduler] version tracking tick failed for user ${userId}:`, error.message);
      }
    }
  }
}

function startSchedulers(options = {}) {
  const versionTrackingTag = options.versionTrackingTag || process.env.VERSION_TRACKING_TAG || 'version-tracking';

  const syncTickIntervalMs = parseMs(process.env.SYNC_TICK_INTERVAL_MS, 60 * 60 * 1000); // hourly
  const versionTrackingTickIntervalMs = parseMs(process.env.VERSION_TRACKING_TICK_INTERVAL_MS, 6 * 60 * 60 * 1000); // every 6 hours
  const startupDelayMs = parseMs(process.env.SCHEDULER_STARTUP_DELAY_MS, DEFAULT_STARTUP_DELAY_MS);

  let starSyncRunning = false;
  let versionTrackingRunning = false;
  let startupTimeoutId = null;
  let syncIntervalId = null;
  let versionIntervalId = null;

  const runStarSync = async () => {
    if (starSyncRunning) return;
    starSyncRunning = true;
    try {
      await runStarSyncTick();
    } finally {
      starSyncRunning = false;
    }
  };

  const runVersionTracking = async () => {
    if (versionTrackingRunning) return;
    versionTrackingRunning = true;
    try {
      await runVersionTrackingTick(versionTrackingTag, versionTrackingTickIntervalMs);
    } finally {
      versionTrackingRunning = false;
    }
  };

  // Delay initial run to avoid rate limit issues on server restart
  console.log(`[scheduler] will start in ${Math.round(startupDelayMs / 1000)}s (sync every ${Math.round(syncTickIntervalMs / 1000)}s, version-tracking="${versionTrackingTag}" every ${Math.round(versionTrackingTickIntervalMs / 1000)}s)`);

  startupTimeoutId = setTimeout(() => {
    console.log('[scheduler] starting initial sync tick...');
    runStarSync().catch(err => console.warn('[scheduler] initial star sync tick failed:', err.message));
    runVersionTracking().catch(err => console.warn('[scheduler] initial version tracking tick failed:', err.message));

    syncIntervalId = setInterval(() => runStarSync().catch(err => console.warn('[scheduler] star sync tick failed:', err.message)), syncTickIntervalMs);
    versionIntervalId = setInterval(() => runVersionTracking().catch(err => console.warn('[scheduler] version tracking tick failed:', err.message)), versionTrackingTickIntervalMs);
  }, startupDelayMs);

  // Return cleanup function for graceful shutdown
  return {
    stop: () => {
      if (startupTimeoutId) clearTimeout(startupTimeoutId);
      if (syncIntervalId) clearInterval(syncIntervalId);
      if (versionIntervalId) clearInterval(versionIntervalId);
      console.log('[scheduler] stopped');
    }
  };
}

module.exports = {
  startSchedulers
};
