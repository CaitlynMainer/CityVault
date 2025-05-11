const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/blacklistController');

router.get('/', controller.showBlacklist);
router.post('/', controller.updateBlacklist);

module.exports = router;
