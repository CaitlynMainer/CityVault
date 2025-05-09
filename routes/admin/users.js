const express = require('express');
const router = express.Router();
const requireAdmin = require('../../middleware/requireAdmin');
const { listUsers, updateUserRole, toggleUserBan } = require('../../controllers/adminController');

router.get('/admin/users', requireAdmin, listUsers);
router.post('/admin/users/:uid/role', requireAdmin, updateUserRole);
router.post('/admin/users/:uid/ban', requireAdmin, toggleUserBan);

module.exports = router;