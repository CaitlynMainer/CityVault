const express = require('express');
const router = express.Router();
const loadController = require(global.BASE_DIR + '/utils/loadController');

const {
  showExportForm,
  handleExportSubmit,
  startSingleExport,
  showExportStatusPage
} = loadController('account/characterExportController');

router.get('/', (req, res) => {
  console.log('[ROUTE] GET /account/character-export');
  return showExportForm(req, res);
});

router.post('/', (req, res) => {
  console.log('[ROUTE] POST /account/character-export');
  return handleExportSubmit(req, res);
});

router.get('/status/:taskId', (req, res) => {
  console.log('[ROUTE] GET status', req.params.taskId);
  return showExportStatusPage(req, res);
});

router.get('/:serverKey/:containerId', (req, res) => {
  console.log('[ROUTE] GET /:serverKey/:containerId', req.params);
  return startSingleExport(req, res);
});

module.exports = router;
