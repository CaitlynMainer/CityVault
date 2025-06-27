const express = require('express');
const router = express.Router();

const loadController = require(global.BASE_DIR + '/utils/loadController');
const { showAccountPage, updateAccount } = loadController('account/accountController');

const requireLogin = require(global.BASE_DIR + '/middleware/requireLogin');

router.get('/', requireLogin, showAccountPage);
router.post('/', requireLogin, updateAccount);

module.exports = router;
