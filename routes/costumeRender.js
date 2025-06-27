const express = require('express');
const router = express.Router();const loadController = require(global.BASE_DIR + '/utils/loadController');
const costumeRenderTools = loadController('costumeRenderTools');


router.post('/', costumeRenderTools.clearCostumeRender);

module.exports = router;
