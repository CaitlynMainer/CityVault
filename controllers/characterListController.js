// controllers/characterListController.js
const sql = require('mssql');
const { getGamePool, getAuthPool } = require(global.BASE_DIR + '/db');
const config = require(global.BASE_DIR + '/data/config.json');

async function listCharacters(req, res) {
  if (!req.session.username) {
    return res.redirect('/login');
  }

  const characters = [];
  const errors = [];
  const serverKeys = Object.keys(config.servers);

  let authId;
  try {
    const authPool = await getAuthPool();
    const result = await authPool.request()
      .input('username', sql.VarChar, req.session.username)
      .query(`SELECT uid FROM dbo.user_account WHERE account = @username`);
    authId = result.recordset[0]?.uid;
    if (!authId) throw new Error('User not found');
  } catch (err) {
    console.error('[CharacterList] AuthId lookup failed:', err);
    return res.status(500).send('Unable to look up account ID.');
  }

  for (const serverKey of serverKeys) {
    try {
      const pool = await getGamePool(serverKey);
      const result = await pool.request()
        .input('authId', sql.Int, authId)
        .query(`
          SELECT ContainerId, Name, Level, Class, Origin, DateCreated
          FROM dbo.Ents
          WHERE AuthId = @authId
        `);

      for (const row of result.recordset) {
        characters.push({
          ...row,
          Level: row.Level + 1,
          serverKey
        });
      }
    } catch (err) {
      errors.push({ server: serverKey, message: err.message });
    }
  }

  res.render('character_list', {
    title: 'My Characters',
    characters,
    servers: config.servers,
    errors
  });
}

module.exports = { listCharacters };
