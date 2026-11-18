const { getGamePool } = require(global.BASE_DIR + '/db');
const sql = require('mssql');
const { isAdmin } = require(global.BASE_DIR + '/utils/roles');

async function updateAccessLevel(req, res) {
  if (!isAdmin(req.user?.role)) return res.status(403).send('Forbidden');

  try {
    const { serverKey, containerId, accessLevel } = req.body;
    const lvl = Math.max(0, Math.min(11, Number(accessLevel)));

    const pool = await getGamePool(serverKey);
	  if (!pool) return res.status(400).send('Invalid server.');
    await pool.request()
      .input('lvl', sql.Int, lvl)
      .input('cid', sql.Int, containerId)
      .query(`
        UPDATE dbo.Ents
        SET AccessLevel = @lvl
        WHERE ContainerId = @cid
      `);

    res.redirect(req.get('Referrer') || '/');
  } catch (err) {
    console.error('[updateAccessLevel]', err);
    res.redirect(req.get('Referrer') || '/');
  }
}

module.exports = {
  updateAccessLevel,
};
