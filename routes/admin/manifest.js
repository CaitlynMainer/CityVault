const express = require('express');
const router = express.Router();
const requireAdmin = require('../../middleware/requireAdmin');
const {
  showConfigPage,
  saveConfig,
  generateManifest,
} = require('../../controllers/admin/manifestController');

router.get('/admin/manifest/config', requireAdmin, showConfigPage);
router.post('/admin/manifest/config', requireAdmin, saveConfig);
router.get('/admin/manifest/generate', requireAdmin, generateManifest);

module.exports = router;
