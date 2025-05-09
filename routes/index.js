const express = require('express');
const router = express.Router();
const { showHomePage } = require('../controllers/indexController');

router.get('/', showHomePage);

module.exports = router;
