const express = require('express');
const router = express.Router();
const requireAdmin = require(global.BASE_DIR + '/middleware/requireAdmin');
const loadController = require(global.BASE_DIR + '/utils/loadController');
const newsController = loadController('admin/newsController');


// These will be served under /admin/news/*
router.get('/', requireAdmin, newsController.showNewsEditor);
router.post('/save', requireAdmin, newsController.saveNews);
router.post('/delete', requireAdmin, newsController.deleteNews);
router.post('/reorder', requireAdmin, newsController.reorderNews);

module.exports = router;

// Add this for route metadata
module.exports.meta = {
  label: 'Edit News',
  icon: '📰',
  access: ['gm', 'admin']
};