const express = require('express');
const router = express.Router();
const controller = require(global.BASE_DIR + '/controllers/portraitController');

router.get('/:filename.png', controller.servePortrait);

module.exports = router;
