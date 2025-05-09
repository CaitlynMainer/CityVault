const sql = require('mssql');
const { gameHashPassword } = require('../utils/hashUtils');
const dbConfig = require('../dbConfig');

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
      const pool = await sql.connect(dbConfig);
  
      const duplicateCheck = await pool.request()
        .input('username', sql.VarChar, username)
        .query(`SELECT COUNT(*) AS count FROM cohauth.dbo.user_account WHERE account = @username`);
  
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
  
    // Begin transaction for inserts
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    const tRequest = new sql.Request(transaction);

    // Get next UID
    const uidResult = await tRequest.query(`SELECT ISNULL(MAX(uid), 0) + 1 AS newID FROM cohauth.dbo.user_account`);
    const uid = uidResult.recordset[0].newID;

    // Insert into user_account
    await new sql.Request(transaction)
    .input('username', sql.VarChar, username)
    .input('uid', sql.Int, uid)
    .input('email', sql.VarChar, email)
    .query(`
        INSERT INTO cohauth.dbo.user_account (account, uid, forum_id, pay_stat, email, role)
        VALUES (@username, @uid, @uid, 1014, @email, 'user')
    `);

    // Insert into user_auth
    await new sql.Request(transaction)
    .input('username', sql.VarChar, username)
    .input('password', sql.VarChar, hexString)
    .query(`
        INSERT INTO cohauth.dbo.user_auth (account, password, salt, hash_type)
        VALUES (@username, CONVERT(BINARY(128), @password), 0, 1)
    `);

    // Insert into user_data
    await new sql.Request(transaction)
    .input('uid', sql.Int, uid)
    .query(`INSERT INTO cohauth.dbo.user_data (uid, user_data) VALUES (@uid, 0x0080C2E000D00B0C000000000CB40058)`);

    // Insert into user_server_group
    await new sql.Request(transaction)
    .input('uid', sql.Int, uid)
    .query(`INSERT INTO cohauth.dbo.user_server_group (uid, server_group_id) VALUES (@uid, 1)`);

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
