const express = require('express');
const router = express.Router();
const costumeRenderTools = require(global.BASE_DIR + '/controllers/costumeRenderTools');

router.post('/', costumeRenderTools.clearCostumeRender);

module.exports = router;
