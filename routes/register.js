const express = require('express');
const router = express.Router();
const { handleRegisterPage, handleRegister } = require('../controllers/registerController');

router.get('/register', handleRegisterPage);
router.post('/register', handleRegister);

module.exports = router;