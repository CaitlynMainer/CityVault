const express = require('express');
const router = express.Router();
const { showAccountPage, updateAccount } = require('../controllers/accountController');
const requireLogin = require('../middleware/requireLogin');

router.get('/', requireLogin, showAccountPage);
router.post('/', requireLogin, updateAccount);

module.exports = router;
