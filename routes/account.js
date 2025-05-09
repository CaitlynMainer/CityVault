const express = require('express');
const router = express.Router();
const { showAccountPage, updateAccount } = require('../controllers/accountController');
const requireLogin = require('../middleware/requireLogin');

router.get('/account', requireLogin, showAccountPage);
router.post('/account', requireLogin, updateAccount);

module.exports = router;
