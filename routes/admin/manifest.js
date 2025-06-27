const express = require('express');
const router = express.Router();
const requireAdmin = require(global.BASE_DIR + '/middleware/requireAdmin');
const loadController = require(global.BASE_DIR + '/utils/loadController');

const {
  showConfigPage,
  saveConfig,
  generateManifest
} = loadController('admin/manifestController');


// These are now relative to /admin/manifest
router.get('/', requireAdmin, showConfigPage);
router.post('/', requireAdmin, saveConfig);
router.get('/generate', requireAdmin, generateManifest);

module.exports = router;

// Add this for route metadata
module.exports.meta = {
  label: 'Manifest Config',
  icon: '📦',
  access: ['admin']
};