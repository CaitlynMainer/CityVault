const express = require('express');
const router = express.Router();
const { showAccountPage, updateAccount } = require(global.BASE_DIR + '/controllers/account/accountController');
const requireLogin = require(global.BASE_DIR + '/middleware/requireLogin');

router.get('/', requireLogin, showAccountPage);
router.post('/', requireLogin, updateAccount);

module.exports = router;
