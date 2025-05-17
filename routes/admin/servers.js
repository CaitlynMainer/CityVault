const express = require('express');
const router = express.Router();
const requireAdmin = require(global.BASE_DIR + '/middleware/requireAdmin');
const serverController = require(global.BASE_DIR + '/controllers/admin/serverController');
console.log('[DEBUG] serverController exports:', serverController);
// Make sure these functions exist in the controller file
router.get('/', requireAdmin, serverController.listServers);
router.post('/save', requireAdmin, serverController.saveServer);
router.post('/delete/:id', requireAdmin, serverController.deleteServer);

module.exports = router;

module.exports.meta = {
  label: 'Manage Servers',
  icon: '🖥️'
};
