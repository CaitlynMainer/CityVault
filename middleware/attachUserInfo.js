const { getAuthPool } = require(global.BASE_DIR + '/db');
const sql = require('mssql');

module.exports = async function attachUserInfo(req, res, next) {
  const username = req.session?.username;
  if (!username) return next();

  try {
    const pool = await getAuthPool();
    const result = await pool.request()
      .input('username', sql.VarChar, username)
      .query(`SELECT account, role FROM cohauth.dbo.user_account WHERE account = @username`);

    if (result.recordset.length > 0) {
      const user = result.recordset[0];
      req.user = {
        username: user.account,
        role: user.role
      };
    } else {
      // fallback if user is missing or deleted
      req.user = { username, role: 'user' };
    }
  } catch (err) {
    console.error('[middleware:attachUserInfo] Failed to load user info:', err);
    req.user = { username, role: 'user' }; // fallback
  }

  next();
};
