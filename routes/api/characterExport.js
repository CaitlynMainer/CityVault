const express = require('express');
const router = express.Router();

const loadController = require(global.BASE_DIR + '/utils/loadController');
const {
  exportCharacter,
  queueCharacterExport,
  checkExportStatus
} = loadController('api/characterExportController');

// Correct paths relative to mount at /api/character/export
router.get('/status/:taskId', checkExportStatus);              // GET /api/character/export/status/:taskId
router.post('/queue', queueCharacterExport);                   // POST /api/character/export/queue
router.get('/:serverKey/:containerId', exportCharacter);       // GET /api/character/export/:serverKey/:containerId

module.exports = router;
