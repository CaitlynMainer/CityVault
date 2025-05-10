const express = require('express');
const router = express.Router();
const requireAdmin = require('../../middleware/requireAdmin');
const styleController = require('../../controllers/admin/styleController');

router.get('/', requireAdmin, styleController.showStyleEditor);
router.post('/', requireAdmin, styleController.saveStyle);
router.post('/reset', requireAdmin, styleController.resetStyle);

module.exports = router;
