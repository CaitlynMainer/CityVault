const express   = require('express');
const sql       = require('mssql');
const { getGamePool } = require(global.BASE_DIR + '/db');

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { serverKey, containerId, accessLevel } = req.body;
    const lvl = Math.max(0, Math.min(11, Number(accessLevel)));

    const pool = await getGamePool(serverKey);
    await pool.request()
      .input('lvl', sql.Int, lvl)
      .input('cid', sql.Int, containerId)
      .query(`
        UPDATE dbo.Ents
        SET    AccessLevel = @lvl
        WHERE  ContainerId = @cid
      `);

    res.redirect('back');
  } catch (err) {
    console.error('[updateAccessLevel]', err);
    res.redirect('back');
  }
});

module.exports = router;

// Add this for route metadata
module.exports.meta = { 
  access : ['admin'], 
  display: false 
};