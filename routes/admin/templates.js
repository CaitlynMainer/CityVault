const express = require('express');
const router = express.Router();
const requireAdmin = require(global.BASE_DIR + '/middleware/requireAdmin');
const {
  listTemplates,
  showEditTemplate,
  saveTemplate
} = require(global.BASE_DIR + '/controllers/admin/templateController');

router.get('/', requireAdmin, listTemplates);
router.get('/edit/:name', requireAdmin, showEditTemplate);
router.post('/edit/:name', requireAdmin, saveTemplate);

module.exports = router;

// Add this for route metadata
module.exports.meta = {
  label: 'Edit Email Templates',
  icon: '📧'
};