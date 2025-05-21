const express = require('express');
const router = express.Router();
const controller = require(global.BASE_DIR + '/controllers/account/petitionsController');

router.get('/', controller.list);

router.get('/:serverKey/:id', controller.view);
router.post('/:serverKey/:id/comment', controller.addComment);


module.exports = router;
