const sql = require('mssql');
const { gameHashPassword } = require('../utils/hashUtils');
const { getAuthPool } = require(global.BASE_DIR + '/db');

function handleLoginPage(req, res) {
  res.render('login');
}

async function handleLogin(req, res) {
  const { username, password } = req.body;
  const rawHash = gameHashPassword(username, password); // 64-byte Buffer
  const hexString = rawHash.toString('hex'); // 128-char hex string
  const sqlStyleBuffer = Buffer.from(hexString, 'utf8'); // Matches MSSQL BINARY(128) behavior

  try {
    const pool = await getAuthPool();

    const result = await pool.request()
      .input('username', sql.VarChar, username)
      .query(`
        SELECT password, role, block_flag
        FROM dbo.user_account ua
        JOIN dbo.user_auth auth ON ua.account = auth.account
        WHERE ua.account = @username
      `);

    if (result.recordset.length === 0) {
      req.flash('error', 'Invalid username or password.');
      req.session._flash_init = true;
      return req.session.save(err => {
        if (err) {
          console.error('Session save error:', err);
          return res.status(500).send('Session save failed.');
        }
        res.redirect('/login');
      });
    }

    const user = result.recordset[0];

    if (user.block_flag === 1) {
      req.flash('error', 'Your account is banned.');
      req.session._flash_init = true;
      return req.session.save(err => {
        if (err) {
          console.error('Session save error:', err);
          return res.status(500).send('Session save failed.');
        }
        res.redirect('/login');
      });
    }

    const stored = user.password;

    if (!stored.equals(sqlStyleBuffer)) {
      req.flash('error', 'Invalid username or password.');
      req.session._flash_init = true;
      return req.session.save(err => {
        if (err) {
          console.error('Session save error:', err);
          return res.status(500).send('Session save failed.');
        }
        res.redirect('/login');
      });
    }

    req.session.username = username;
    req.session.role = user.role;

    req.session.save(err => {
      if (err) {
        console.error('Session save error:', err);
        req.flash('error', 'Login failed due to session error.');
        return res.redirect('/login');
      }

      const redirectTo = req.session.returnTo || '/';
      delete req.session.returnTo;
      console.log('[Login POST] returnTo:', redirectTo);
      res.redirect(redirectTo);
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Login failed due to server error.');
    res.redirect('/login');
  }
}

module.exports = {
  handleLoginPage,
  handleLogin
};
