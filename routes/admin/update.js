const express = require('express');
const router = express.Router();
const requireAdmin = require('../../middleware/requireAdmin');
const { downloadAndExtractUpdate } = require('../../controllers/admin/updateController');

router.post('/', requireAdmin, downloadAndExtractUpdate);

module.exports = router;
