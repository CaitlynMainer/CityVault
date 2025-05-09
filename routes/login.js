const express = require('express');
const router = express.Router();
const { handleLoginPage, handleLogin } = require('../controllers/loginController');

router.get('/login', handleLoginPage);
router.post('/login', handleLogin);

module.exports = router;
