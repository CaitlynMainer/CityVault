const express = require('express');
const router = express.Router();
const loadController = require(global.BASE_DIR + '/utils/loadController');
const controller = loadController('account/petitionsController');


router.get('/', controller.list);

router.get('/:serverKey/:id', controller.view);
router.post('/:serverKey/:id/comment', controller.addComment);


module.exports = router;
