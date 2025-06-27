const express = require('express');
const router = express.Router();
const loadController = require(global.BASE_DIR + '/utils/loadController');
const { showCharacter, uploadPortrait, deletePortrait } = loadController('characterController');


router.get('/:id', showCharacter);
router.post('/uploadPortrait', uploadPortrait); 

router.post('/deletePortrait', deletePortrait);


module.exports = router;
