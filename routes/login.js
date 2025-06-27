const express = require('express');
const router = express.Router();
const loadController = require(global.BASE_DIR + '/utils/loadController');

const {
  handleLoginPage,
  handleLogin,
  handleResetPage,
  handleResetRequest,
  handleResetConfirmPage,
  handleResetConfirm
} = loadController('loginController');


// Serve /login page
router.get('/', handleLoginPage);
router.post('/', handleLogin);

// Handle POST to /login
router.post('/', handleLogin);

// Password reset request form
router.get('/reset', handleResetPage);
router.post('/reset', handleResetRequest);

// Password reset confirmation (with token)
router.get('/reset/confirm', handleResetConfirmPage);
router.post('/reset/confirm', handleResetConfirm);

module.exports = router;
