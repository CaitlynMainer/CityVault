const express = require('express');
const router = express.Router();
const controller = require(global.BASE_DIR + '/controllers/admin/blacklistController');

router.get('/', controller.showBlacklist);
router.post('/', controller.updateBlacklist);

module.exports = router;

// Add this for route metadata
module.exports.meta = {
  label: 'Edit Badge Blacklist',
  icon: '⛔'
};