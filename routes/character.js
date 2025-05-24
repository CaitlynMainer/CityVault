const express = require('express');
const router = express.Router();
const { showCharacter, uploadPortrait, deletePortrait } = require(global.BASE_DIR + '/controllers/characterController');

router.get('/:id', showCharacter);
router.post('/uploadPortrait', uploadPortrait); 

router.post('/deletePortrait', deletePortrait);


module.exports = router;
