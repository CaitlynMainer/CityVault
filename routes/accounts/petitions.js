const express = require('express');
const router = express.Router();
const controller = require(global.BASE_DIR + '/controllers/account/petitionsController');

router.get('/', controller.list);

module.exports = router;
