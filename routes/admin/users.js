const express = require('express');
const router = express.Router();
const requireAdmin = require(global.BASE_DIR + '/middleware/requireAdmin');
const loadController = require(global.BASE_DIR + '/utils/loadController');

const {
  listUsers,
  updateUserRole,
  toggleUserBan,
  getUserNotes,
  addUserNote
} = loadController('admin/userController');

router.get('/', requireAdmin, listUsers);
router.post('/:uid/role', requireAdmin, updateUserRole);
router.post('/:uid/ban', requireAdmin, toggleUserBan);
router.get('/:uid/notes', requireAdmin, getUserNotes);
router.post('/:uid/notes', requireAdmin, addUserNote);
module.exports = router;


// Add this for route metadata
module.exports.meta = {
  label: 'Manage Users',
  icon: '👥',
  access: ['gm', 'admin']
};