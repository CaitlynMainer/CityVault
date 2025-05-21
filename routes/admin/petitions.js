const express = require('express');
const router = express.Router();
const controller = require(global.BASE_DIR + '/controllers/admin/petitionsController');

// Paginated list of all petitions (across all servers)
router.get('/', controller.list);

// View a single petition by server and ID
router.get('/:serverKey/:id', controller.view);

// Mark petition as Fetched
router.post('/:serverKey/:id/fetch', controller.markFetched);

// Mark petition as Done
router.post('/:serverKey/:id/done', controller.markDone);

router.post('/:serverKey/:id/toggle/:field', controller.toggleStatus);

module.exports = router;
// Add this for route metadata
module.exports.meta = {
  label: 'Ingame Support',
  icon: '🆘'
};