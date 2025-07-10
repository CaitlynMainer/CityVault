const express = require('express');
const router = express.Router();

const loadController = require(global.BASE_DIR + '/utils/loadController');
const { exportCharacter } = loadController('api/characterExportController');

router.get('/export/:serverKey/:containerId', exportCharacter);

module.exports = router;