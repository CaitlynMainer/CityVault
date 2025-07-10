const express = require('express');
const multer = require('multer');
const router = express.Router();
const loadController = require(global.BASE_DIR + '/utils/loadController');
const { importCharacter } = loadController('api/characterImportController');

const upload = multer({ storage: multer.memoryStorage() });

router.post('/import/:serverKey', upload.single('importZip'), importCharacter);

module.exports = router;
