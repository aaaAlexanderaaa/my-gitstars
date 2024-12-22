const express = require('express');
const SyncService = require('../services/syncService');
const { ensureAuth } = require('../middleware/auth');
const { SyncStatus } = require('../models');

const router = express.Router();

router.post('/sync', ensureAuth, async (req, res) => {
  try {
    const syncedCount = await SyncService.syncUserStars(req.user.id);
    res.json({ message: `Successfully synced ${syncedCount} repositories` });
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ error: 'Failed to sync repositories' });
  }
});

router.get('/sync/status', ensureAuth, async (req, res) => {
  try {
    const status = await SyncStatus.findOne({
      where: { userId: req.user.id },
      order: [['createdAt', 'DESC']]
    });
    res.json(status || { status: 'completed', progress: 100 });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch sync status' });
  }
});

module.exports = router; 