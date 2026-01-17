const express = require('express');
const SyncService = require('../services/syncService');
const { ensureAuth } = require('../middleware/auth');
const { SyncStatus } = require('../models');

const router = express.Router();

router.post('/sync', ensureAuth, async (req, res) => {
  try {
    const result = await SyncService.syncUserStars(req.user.id);
    const syncStatus = result.syncStatus ? result.syncStatus.get({ plain: true }) : null;
    res.status(result.started ? 202 : 200).json({
      started: result.started,
      status: syncStatus
    });
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ error: 'Failed to sync repositories' });
  }
});

router.get('/sync/status', ensureAuth, async (req, res) => {
  try {
    const latest = await SyncStatus.findOne({
      where: { userId: req.user.id },
      order: [['createdAt', 'DESC']]
    });

    const lastCompleted = await SyncStatus.findOne({
      where: { userId: req.user.id, status: 'completed' },
      order: [['updatedAt', 'DESC']]
    });

    res.json({
      id: latest ? latest.id : null,
      status: latest ? latest.status : 'completed',
      progress: latest ? latest.progress : 100,
      error: latest ? latest.error : null,
      startedAt: latest ? latest.createdAt : null,
      updatedAt: latest ? latest.updatedAt : null,
      lastCompletedAt: lastCompleted ? lastCompleted.updatedAt : null
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch sync status' });
  }
});

module.exports = router;
