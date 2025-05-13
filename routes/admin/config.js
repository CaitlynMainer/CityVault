const express = require('express');
const router = express.Router();
const configController = require('../../controllers/admin/configController');

router.get('/', configController.showEditor);
router.post('/', configController.saveEditor);

module.exports = router;
