const express = require('express');
const router = express.Router();const loadController = require(global.BASE_DIR + '/utils/loadController');
const controller = loadController('portraitController');


router.get('/:filename.png', controller.servePortrait);

module.exports = router;
