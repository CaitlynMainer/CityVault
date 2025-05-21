const express = require('express');
const router = express.Router();
const requireAdmin = require(global.BASE_DIR + '/middleware/requireAdmin');
const styleController = require(global.BASE_DIR + '/controllers/admin/styleController');

router.get('/', requireAdmin, styleController.showStyleEditor);
router.post('/', requireAdmin, styleController.saveStyle);
router.post('/reset', requireAdmin, styleController.resetStyle);

module.exports = router;

// Add this for route metadata
module.exports.meta = {
  label: 'Edit Site Style',
  icon: '🎨',
  access: ['admin']
};