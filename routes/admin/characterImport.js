const express = require('express');
const router = express.Router();
const loadController = require(global.BASE_DIR + '/utils/loadController');
const multer = require('multer');

// Load controller functions
const { showImportForm, handleImportSubmit } = loadController('admin/characterImportController');

// Configure Multer to store file in memory
const upload = multer({ storage: multer.memoryStorage() });

// Route to show the form
router.get('/', showImportForm);

// Route to handle the form submission with file upload
router.post('/', upload.single('importZip'), handleImportSubmit);

module.exports = router;
