const express = require('express');
const router = express.Router();
const loadController = require(global.BASE_DIR + '/utils/loadController');
const multer = require('multer');

const { showImportForm, handleImportSubmit, showImportStatusPage } = loadController('admin/characterImportController');
const { getImportStatus } = loadController('api/importStatusController');

const upload = multer({ storage: multer.memoryStorage() });

router.get('/', showImportForm);
router.post('/', upload.single('importZip'), handleImportSubmit);

router.get('/status/:taskId', showImportStatusPage);

router.get('/import/status/:taskId', getImportStatus);

module.exports = router;

// Add this for route metadata
module.exports.meta = {
  label: 'Character Import',
  icon: '🗃️',
  access: ['admin']
};