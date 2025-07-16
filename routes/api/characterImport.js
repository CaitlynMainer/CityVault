const express = require('express');
const multer = require('multer');
const router = express.Router();
const loadController = require(global.BASE_DIR + '/utils/loadController');

const { importCharacter } = loadController('api/characterImportController');
const { getImportStatus } = loadController('api/importStatusController');

const upload = multer({ storage: multer.memoryStorage() });

router.post('/:serverKey', upload.single('importZip'), importCharacter);

router.get('/status/:taskId', getImportStatus);

module.exports = router;
