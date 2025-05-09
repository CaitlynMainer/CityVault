const express = require('express');
const router = express.Router();
const requireAdmin = require('../../middleware/requireAdmin');
const newsController = require('../../controllers/admin/newsController');

router.get('/admin/news', requireAdmin, newsController.showNewsEditor);
router.post('/admin/news/save', requireAdmin, newsController.saveNews);
router.post('/admin/news/delete', requireAdmin, newsController.deleteNews);
router.post('/admin/news/reorder', requireAdmin, newsController.reorderNews);

module.exports = router;
