// controllers/publicProfileController.js
const sql = require('mssql');
const { getAuthPool, getGamePool } = require(global.BASE_DIR + '/db');
const config = require(global.BASE_DIR + '/data/config.json');

async function showPublicProfile(req, res) {
  const authId = parseInt(req.params.authId);
  if (isNaN(authId)) return res.status(400).send('Invalid user ID');

  try {
    const authPool = await getAuthPool();
    const result = await authPool.request()
      .input('uid', sql.Int, authId)
      .query(`SELECT account, tracker FROM dbo.user_account WHERE uid = @uid`);

    const user = result.recordset[0];
    if (!user) return res.status(404).send('User not found');

    if (user.tracker !== '1') {
    return res.render('public_profile', {
        title: 'Private Profile',
        message: "This user doesn't share their characters.",
        characters: [],
        servers: config.servers,
        username: user.account,
        errors: [] // ✅ fix: define empty errors array
    });
    }

    const characters = [];
    const serverKeys = Object.keys(config.servers);
    const errors = [];

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

    res.render('public_profile', {
      title: `Characters of ${user.account}`,
      message: null,
      characters,
      servers: config.servers,
      username: user.account,
      errors
    });
  } catch (err) {
    console.error('[Public Profile Error]', err);
    res.status(500).send('Server error loading profile.');
  }
}

module.exports = { showPublicProfile };
