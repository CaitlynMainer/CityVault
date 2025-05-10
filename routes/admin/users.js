const express = require('express');
const router = express.Router();
const requireAdmin = require('../../middleware/requireAdmin');
const { listUsers, updateUserRole, toggleUserBan } = require('../../controllers/admin/userController');

router.get('/', requireAdmin, listUsers);
router.post('/:uid/role', requireAdmin, updateUserRole);
router.post('/:uid/ban', requireAdmin, toggleUserBan);

module.exports = router;