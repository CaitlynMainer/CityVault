const sql = require('mssql');
const { getAuthPool } = require(global.BASE_DIR + '/db');
const { gameHashPassword } = require(global.BASE_DIR + '/utils/hashUtils');

async function showAccountPage(req, res) {
  try {
    const pool = await getAuthPool();
    const result = await pool.request()
      .input('account', sql.VarChar, req.session.username)
      .query('SELECT email, tracker FROM dbo.user_account WHERE account = @account');

    const email = result.recordset[0]?.email || '';
    const tracker = result.recordset[0]?.tracker === '1';

    res.render('account', {
      title: 'Account Settings',
      username: req.session.username,
      role: req.session.role,
      email,
      tracker
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to load account info.');
  }
}

async function updateAccount(req, res) {
  if (!req.session.username) return res.redirect('/login');

  const { email, oldPassword, newPassword, tracker } = req.body;
  const account = req.session.username;

  try {
    const pool = await getAuthPool();

    const result = await pool.request()
      .input('account', sql.VarChar, account)
      .query('SELECT password FROM dbo.user_auth WHERE account = @account');

    const storedHash = Buffer.from(result.recordset[0].password).toString('utf8').toLowerCase();
    const inputHash = gameHashPassword(account, oldPassword).toString('hex').toLowerCase();

    if (!storedHash.startsWith(inputHash)) {
      req.flash('error', 'Error updating account.');
      req.session._flash_init = true;
      return req.session.save(() => res.redirect('/account'));
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

    const trackerValue = tracker === 'on' ? 1 : 0;
    await pool.request()
      .input('account', sql.VarChar, account)
      .input('tracker', sql.Int, trackerValue)
      .query('UPDATE dbo.user_account SET tracker = @tracker WHERE account = @account');
    req.flash('success', '✅ Account updated successfully!');
    req.session._flash_init = true;
    return req.session.save(() => res.redirect('/account'));
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error updating account.');
    res.redirect('/account');
  }
}

module.exports = {
  showAccountPage,
  updateAccount
};
