const express = require('express');
const router = express.Router();
const requireAdmin = require(global.BASE_DIR + '/middleware/requireAdmin');

router.use('/', require('./dashboard'));
router.use('/manifest', require('./manifest'));
router.use('/users', require('./users'));
router.use('/updateAccessLevel', require('./updateAccessLevel'));
router.use('/news', require('./news'));
router.use('/style', require('./style')); 
router.use('/blacklist', require('./blacklist')); 
router.use('/config', require('./config'));
router.use('/download-update', require('./update'));
router.use('/templates', require('./templates'));
router.use('/servers', require('./servers'));
router.use('/petitions', require('./petitions'));
router.use('/character-import', require('./characterImport'));


module.exports = router;