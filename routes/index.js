const express = require('express');
const router = express.Router();
const sql = require('mssql');
const { getGamePool } = require(global.BASE_DIR + '/db');
const { debugBadgeDiscrepancies } = require(global.BASE_DIR + '/utils/debugBadges');
const { showCharacterList } = require(global.BASE_DIR + '/controllers/account/characterListController');
const { showPublicProfile } = require(global.BASE_DIR + '/controllers/publicProfileController');
const { showSupergroup } = require(global.BASE_DIR + '/controllers/supergroupController');

// Homepage
const { showHomePage } = require(global.BASE_DIR + '/controllers/indexController');
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

router.use('/account/petitions', require('./accounts/petitions'));

// Admin routes (under /admin/)
router.use('/admin', require('./admin'));

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
