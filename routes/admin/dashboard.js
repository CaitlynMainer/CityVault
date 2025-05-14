const express = require('express');
const router = express.Router();
const { showDashboard } = require(global.BASE_DIR + '/controllers/admin/adminController');
const requireAdmin = require(global.BASE_DIR + '/middleware/requireAdmin');

router.get('/', requireAdmin, showDashboard);

module.exports = router;
