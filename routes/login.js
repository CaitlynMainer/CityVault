const express = require('express');
const router = express.Router();
const { handleLoginPage, handleLogin } = require('../controllers/loginController');

// Serve /login page
router.get('/', handleLoginPage);

// Handle POST to /login
router.post('/', handleLogin);

module.exports = router;
