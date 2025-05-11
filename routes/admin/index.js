const express = require('express');
const router = express.Router();
const requireAdmin = require('../../middleware/requireAdmin');

router.use('/', require('./dashboard'));
router.use('/manifest', require('./manifest'));
router.use('/users', require('./users'));
router.use('/news', require('./news'));
router.use('/style', require('./style')); 
router.use('/edit_blacklist', require('./blacklist')); 

module.exports = router;