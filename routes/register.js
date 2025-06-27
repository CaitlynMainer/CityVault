const express = require('express');
const router = express.Router();const loadController = require(global.BASE_DIR + '/utils/loadController');

const {
  handleRegisterPage,
  handleRegister,
  handleConfirmAccount
} = loadController('registerController');


router.get('/', handleRegisterPage);
router.post('/', handleRegister);

// Handle email confirmation via token
router.get('/confirm/:token', handleConfirmAccount);

module.exports = router;