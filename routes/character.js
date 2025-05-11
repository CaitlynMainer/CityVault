const express = require('express');
const router = express.Router();
const characterController = require(global.BASE_DIR + '/controllers/characterController');

router.get('/:id', characterController.showCharacter);

module.exports = router;
