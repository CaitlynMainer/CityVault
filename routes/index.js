const express = require('express');
const router = express.Router();
const sql = require('mssql');
const { getGamePool } = require(global.BASE_DIR + '/db');
const { debugBadgeDiscrepancies } = require(global.BASE_DIR + '/utils/debugBadges');
const loadController = require(global.BASE_DIR + '/utils/loadController');

const { showCharacterList } = loadController('account/characterListController');
const { showPublicProfile } = loadController('publicProfileController');
const { showSupergroup } = loadController('supergroupController');
const { showHomePage } = loadController('indexController');
const { showStats } = loadController('statsController');

router.get('/', showHomePage);

// User-related routes
router.use('/account', require('./account'));
router.use('/login', require('./login'));
router.use('/logout', require('./logout'));
router.use('/register', require('./register'));

// Character viewer (e.g. /character/victory:12345)
router.use('/character', require('./character'));

// Supergroup viewer (e.g. /supergroup/victory:34)
router.get('/supergroup/:id', showSupergroup);

// Public character/profile views
router.get('/account/characters', showCharacterList);
router.get('/profile/:authId', showPublicProfile);

router.use('/account/petitions', require('./account/petitions'));
router.use('/account/character-export', require('./account/characterExport'));

// Admin routes (under /admin/)
router.use('/admin', require('./admin'));

router.use('/images/portrait', require('./portrait'));

router.use('/clear-costume-render', require('./costumeRender'));

router.get('/stats', showStats);

//API
router.use('/api', require('./api/news'));
router.use('/api/character/export', require('./api/characterExport'));
router.use('/api/character/import', require('./api/characterImport'));


// Debug routes
router.get('/debug/missing-badges/:serverKey/:dbid', async (req, res) => {
  const { serverKey, dbid } = req.params;

  try {
    const pool = await getGamePool(serverKey);
    const result = await pool.request()
      .input('dbid', sql.Int, parseInt(dbid))
      .query(`SELECT Owned FROM dbo.Badges WHERE ContainerId = @dbid`);

    const bitfield = result.recordset[0]?.Owned || '';
    const { tourism, gladiator } = debugBadgeDiscrepancies(bitfield, serverKey);

    res.send({
      missingTourism: tourism,
      missingGladiator: gladiator
    });
  } catch (err) {
    console.error('Error in badge debug route:', err);
    res.status(500).send({ error: 'Badge debug failed' });
  }
});

module.exports = router;
