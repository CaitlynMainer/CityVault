const express = require('express');
const router = express.Router();
const requireAdmin = require('../../middleware/requireAdmin');
const {
  showConfigPage,
  saveConfig,
  generateManifest,
} = require('../../controllers/admin/manifestController');

// These are now relative to /admin/manifest
router.get('/config', requireAdmin, showConfigPage);
router.post('/config', requireAdmin, saveConfig);
router.get('/generate', requireAdmin, generateManifest);

module.exports = router;
