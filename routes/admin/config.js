const express = require('express');
const router = express.Router();
const configController = require(global.BASE_DIR + '/controllers/admin/configController');

router.get('/', configController.showEditor);
router.post('/', configController.saveEditor);

module.exports = router;

// Add this for route metadata
module.exports.meta = {
  label: 'Edit Config',
  icon: '🛠️'
};