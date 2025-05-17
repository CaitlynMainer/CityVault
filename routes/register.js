const express = require('express');
const router = express.Router();
const { handleRegisterPage, handleRegister, handleConfirmAccount } = require('../controllers/registerController');

router.get('/', handleRegisterPage);
router.post('/', handleRegister);

// Handle email confirmation via token
router.get('/confirm/:token', handleConfirmAccount);

module.exports = router;