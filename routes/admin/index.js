const express = require('express');
const router = express.Router();
const requireAdmin = require('../../middleware/requireAdmin');

router.get('/admin', requireAdmin, (req, res) => {
  res.render('admin/index', { title: 'Admin Dashboard' });
});

module.exports = router;