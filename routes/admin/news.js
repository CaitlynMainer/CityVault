const express = require('express');
const router = express.Router();
const requireAdmin = require('../../middleware/requireAdmin');
const newsController = require('../../controllers/admin/newsController');

// These will be served under /admin/news/*
router.get('/', requireAdmin, newsController.showNewsEditor);
router.post('/save', requireAdmin, newsController.saveNews);
router.post('/delete', requireAdmin, newsController.deleteNews);
router.post('/reorder', requireAdmin, newsController.reorderNews);

module.exports = router;
