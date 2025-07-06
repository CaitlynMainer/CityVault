const express = require('express');
const router = express.Router();
const requireAdmin = require(global.BASE_DIR + '/middleware/requireAdmin');
const loadController = require(global.BASE_DIR + '/utils/loadController');
const serverController = loadController('admin/serverController');


router.get('/', requireAdmin, serverController.listServers);
router.post('/save', requireAdmin, serverController.saveServer);
router.post('/delete/:id', requireAdmin, serverController.deleteServer);

module.exports = router;

module.exports.meta = {
  label: 'Manage Servers',
  icon: '🖥️',
  access: ['admin']
};
