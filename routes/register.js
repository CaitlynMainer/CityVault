const express = require('express');
const router = express.Router();
const { handleRegisterPage, handleRegister } = require('../controllers/registerController');

router.get('/', handleRegisterPage);
router.post('/', handleRegister);

module.exports = router;