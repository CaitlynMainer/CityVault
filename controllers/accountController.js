const sql = require('mssql');
const { getAuthPool } = require(global.BASE_DIR + '/db');
const { gameHashPassword } = require('../utils/hashUtils');

async function showAccountPage(req, res) {
  //if (!req.session.username) return res.redirect('/login');

  try {
    const pool = await getAuthPool();
    const result = await pool.request()
      .input('account', sql.VarChar, req.session.username)
      .query('SELECT email FROM dbo.user_account WHERE account = @account');

    const email = result.recordset[0]?.email || '';

    res.render('account', {
      title: 'Account Settings',
      username: req.session.username,
      role: req.session.role,
      email
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to load account info.');
  }
}

async function updateAccount(req, res) {
  if (!req.session.username) return res.redirect('/login');

  const { email, oldPassword, newPassword } = req.body;
  const account = req.session.username;

  try {
    const pool = await getAuthPool();

    const result = await pool.request()
      .input('account', sql.VarChar, account)
      .query('SELECT password FROM dbo.user_auth WHERE account = @account');

    const storedHash = Buffer.from(result.recordset[0].password).toString('utf8').toLowerCase();
    const inputHash = gameHashPassword(account, oldPassword).toString('hex').toLowerCase();

    if (!storedHash.startsWith(inputHash)) {
      return res.send(`<p style="color:red">❌ Incorrect current password.</p>`);
    }

    if (email) {
      await pool.request()
        .input('account', sql.VarChar, account)
        .input('email', sql.VarChar, email)
        .query('UPDATE dbo.user_account SET email = @email WHERE account = @account');
    }

    if (newPassword) {
      const hashBuffer = gameHashPassword(account, newPassword);
      const hexString = hashBuffer.toString('hex');

      await pool.request()
        .input('account', sql.VarChar, account)
        .input('password', sql.VarChar, hexString)
        .query(`
          UPDATE dbo.user_auth
          SET password = CONVERT(BINARY(128), @password)
          WHERE account = @account
        `);
    }

    res.send('✅ Account updated successfully!');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error updating account.');
  }
}

module.exports = {
  showAccountPage,
  updateAccount
};
