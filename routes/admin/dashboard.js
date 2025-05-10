const express = require('express');
const router = express.Router();
const requireAdmin = require('../../middleware/requireAdmin');

router.get('/', requireAdmin, (req, res) => {
  res.render('admin/index', {
    title: 'Admin Dashboard',
    user: req.session.user
  });
});

module.exports = router;
