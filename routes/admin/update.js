const express = require('express');
const router = express.Router();
const requireAdmin = require(global.BASE_DIR + '/middleware/requireAdmin');
const { downloadAndExtractUpdate } = require(global.BASE_DIR + '/controllers/admin/updateController');

router.post('/', requireAdmin, downloadAndExtractUpdate);

module.exports = router;

// Add this for route metadata
module.exports.meta = {
  display: false
};