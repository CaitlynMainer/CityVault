const express = require('express');
const router = express.Router();
const { showCharacter, uploadPortrait } = require(global.BASE_DIR + '/controllers/characterController');

router.get('/:id', showCharacter);
router.post('/uploadPortrait', uploadPortrait); // ← Add this

router.post('/uploadPortrait', uploadPortrait); // ← Add this


module.exports = router;
