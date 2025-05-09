const sql = require('mssql');
const dbConfig = require('../dbConfig');
const { gameHashPassword } = require('../utils/hashUtils');

async function showAccountPage(req, res) {
  //if (!req.session.username) return res.redirect('/login');

  try {
    const pool = await sql.connect(dbConfig);
    const result = await pool.request()
      .input('account', sql.VarChar, req.session.username)
      .query('SELECT email FROM cohauth.dbo.user_account WHERE account = @account');

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

  try {
    const pool = await sql.connect(dbConfig);
    const account = req.session.username;

    const result = await pool.request()
      .input('account', sql.VarChar, account)
      .query('SELECT password FROM cohauth.dbo.user_auth WHERE account = @account');

      const storedHash = Buffer.from(result.recordset[0].password).toString('utf8').toLowerCase();
      const inputHash = gameHashPassword(account, oldPassword).toString('hex').toLowerCase();
      
      if (!storedHash.startsWith(inputHash)) {
        return res.send(`<p style="color:red">❌ Incorrect current password.</p>`);
      }

    if (email) {
      await pool.request()
        .input('account', sql.VarChar, account)
        .input('email', sql.VarChar, email)
        .query('UPDATE cohauth.dbo.user_account SET email = @email WHERE account = @account');
    }

    if (newPassword) {
        const request = new sql.Request();
    
        const hashBuffer = gameHashPassword(account, newPassword); // returns a 64-byte Buffer
        const hexString = hashBuffer.toString('hex'); // convert to 128-character hex string for MSSQL
    
        request.input('account', sql.VarChar, account);
        request.input('password', sql.VarChar, hexString); // use VarChar for CONVERT(BINARY(128), ...)
    
        await request.query(`
          UPDATE cohauth.dbo.user_auth
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
