const sql = require('mssql');
const config = require(global.BASE_DIR + '/utils/config');
const { getGamePool, getAuthPool } = require(global.BASE_DIR + '/db');

async function list(req, res) {
  const username = req.session.username;
  if (!username) return res.status(401).send('Unauthorized');

  const allPetitions = [];

  for (const serverKey of Object.keys(config.servers)) {
    const pool = await getGamePool(serverKey);
    const result = await pool.request()
      .input('authName', sql.VarChar(32), username)
      .query(`SELECT *, '${serverKey}' AS serverKey FROM dbo.Petitions WHERE AuthName = @authName`);

    allPetitions.push(...result.recordset);
  }

  allPetitions.sort((a, b) => new Date(b.Date) - new Date(a.Date));

  res.render('account/petitions/list', { petitions: allPetitions });
};
module.exports = { list };