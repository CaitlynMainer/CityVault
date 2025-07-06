const express = require('express');
const router = express.Router();
const loadController = require(global.BASE_DIR + '/utils/loadController');
const { showDashboard } = loadController('admin/adminController');

const requireAdmin = require(global.BASE_DIR + '/middleware/requireAdmin');

router.get('/', requireAdmin, showDashboard);

module.exports = router;
