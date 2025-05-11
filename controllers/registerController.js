const sql = require('mssql');
const { gameHashPassword } = require('../utils/hashUtils');
const { getAuthPool } = require(global.BASE_DIR + '/db');

function handleRegisterPage(req, res) {
  res.render('register');
}

async function handleRegister(req, res) {
  const { username, password, email } = req.body;
  const hashedPassword = gameHashPassword(username, password);
  const hexString = hashedPassword.toString('hex');

  if (username.length > 14) {
    req.flash('error', 'Username must be 14 characters or fewer.');
    return req.session.save(err => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).send('Session error.');
      }
      res.redirect('/register');
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    req.flash('error', 'Invalid email format.');
    return req.session.save(err => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).send('Session error.');
      }
      res.redirect('/register');
    });
  }

  try {
    const pool = await getAuthPool();

    const duplicateCheck = await pool.request()
      .input('username', sql.VarChar, username)
      .query(`SELECT COUNT(*) AS count FROM dbo.user_account WHERE account = @username`);

    if (duplicateCheck.recordset[0].count > 0) {
      req.flash('error', 'That username is already taken.');
      console.log("⚠️ DUPLICATE USERNAME — setting flash & redirecting");
      return req.session.save(err => {
        if (err) {
          console.error('Session save error:', err);
          return res.status(500).send('Session error.');
        }
        res.redirect('/register');
      });
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    const tRequest = new sql.Request(transaction);

    // Get next UID
    const uidResult = await tRequest.query(`SELECT ISNULL(MAX(uid), 0) + 1 AS newID FROM dbo.user_account`);
    const uid = uidResult.recordset[0].newID;

    // Insert into user_account
    await tRequest
      .input('username', sql.VarChar, username)
      .input('uid', sql.Int, uid)
      .input('email', sql.VarChar, email)
      .query(`
        INSERT INTO dbo.user_account (account, uid, forum_id, pay_stat, email, role)
        VALUES (@username, @uid, @uid, 1014, @email, 'user')
      `);

    // Insert into user_auth
    await tRequest
      .input('password', sql.VarChar, hexString)
      .query(`
        INSERT INTO dbo.user_auth (account, password, salt, hash_type)
        VALUES (@username, CONVERT(BINARY(128), @password), 0, 1)
      `);

    // Insert into user_data
    await tRequest
      .query(`INSERT INTO dbo.user_data (uid, user_data) VALUES (@uid, 0x0080C2E000D00B0C000000000CB40058)`);

    // Insert into user_server_group
    await tRequest
      .query(`INSERT INTO dbo.user_server_group (uid, server_group_id) VALUES (@uid, 1)`);

    await transaction.commit();

    req.flash('success', `Account '${username}' created successfully!`);
    return req.session.save(err => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).send('Session error.');
      }
      res.redirect('/login');
    });
  } catch (err) {
    console.error('[Register Error]', err);
    req.flash('error', 'Account creation failed. Check logs.');
    return req.session.save(err => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).send('Session error.');
      }
      res.redirect('/register');
    });
  }
}

module.exports = {
  handleRegisterPage,
  handleRegister
};
