const express = require('express');
const router = express.Router();

// Homepage
const { showHomePage } = require('../controllers/indexController');
router.get('/', showHomePage);

// User-related routes
router.use('/account', require('./account'));
router.use('/login', require('./login'));
router.use('/logout', require('./logout'));
router.use('/register', require('./register'));

// Admin routes (under /admin/)
router.use('/admin', require('./admin'));

module.exports = router;
