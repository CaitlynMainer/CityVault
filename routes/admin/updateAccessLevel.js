const express = require('express');
const router = express.Router();

const loadController = require(global.BASE_DIR + '/utils/loadController');
const { updateAccessLevel } = loadController('admin/accessLevelController');

router.post('/', updateAccessLevel);

module.exports = router;

// Add this for route metadata
module.exports.meta = {
  access: ['admin'],
  display: false
};
