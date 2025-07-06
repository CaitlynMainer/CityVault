const express = require('express');
const router = express.Router();
const requireAdmin = require(global.BASE_DIR + '/middleware/requireAdmin');
const loadController = require(global.BASE_DIR + '/utils/loadController');

const {
  listTemplates,
  showEditTemplate,
  saveTemplate
} = loadController('admin/templateController');


router.get('/', requireAdmin, listTemplates);
router.get('/edit/:name', requireAdmin, showEditTemplate);
router.post('/edit/:name', requireAdmin, saveTemplate);

module.exports = router;

// Add this for route metadata
module.exports.meta = {
  label: 'Edit Email Templates',
  icon: '📧',
  access: ['admin']
};