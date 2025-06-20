const sql = require('mssql');
const crypto = require('crypto');
const { gameHashPassword } = require(global.BASE_DIR + '/utils/hashUtils');
const { getAuthPool } = require(global.BASE_DIR + '/db');
const config = require(global.BASE_DIR + '/utils/config');
const { sendMail } = require(global.BASE_DIR + '/services/mail');

function handleRegisterPage(req, res) {
  res.render('register');
}

async function handleRegister(req, res) {
  const { username, password, email } = req.body;
  const hashedPassword = gameHashPassword(username, password);
  const hexString = hashedPassword.toString('hex');

  if (username.length > 14) {
    req.flash('error', 'Username must be 14 characters or fewer.');
    return res.redirect('/register');
  }

  const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  if (!emailRegex.test(email)) {
    req.flash('error', 'Invalid email format.');
    return res.redirect('/register');
  }

  let transaction;
  let uid;

  try {
    const pool = await getAuthPool();
    const driverName = pool?.driver?.name || 'unknown';
    const useTransaction = (driverName === 'tedious');

    // Check username
    const checkUser = await pool.request()
      .input('username', sql.VarChar, username)
      .query(`SELECT COUNT(*) AS count FROM dbo.user_account WHERE account = @username`);

    if (checkUser.recordset[0].count > 0) {
      req.flash('error', 'That username is already taken.');
      return res.redirect('/register');
    }

    // Check email
    const checkEmail = await pool.request()
      .input('email', sql.VarChar, email)
      .query(`SELECT COUNT(*) AS count FROM dbo.user_account WHERE email = @email`);

    if (checkEmail.recordset[0].count > 0) {
      req.flash('error', 'That email is already registered.');
      return res.redirect('/register');
    }

    // UID assignment
    const uidResult = await pool.request().query(`SELECT ISNULL(MAX(uid), 0) + 1 AS newID FROM dbo.user_account`);
    uid = uidResult.recordset[0].newID;

    const token = crypto.randomBytes(32).toString('hex');
    const blockFlag = config.email?.provider && config.email?.fromEmail ? 2 : 0;

    if (useTransaction) {
      transaction = new sql.Transaction(pool);
      await transaction.begin();
    }

    const getRequest = () => useTransaction
      ? new sql.Request(transaction)
      : pool.request();

    // user_account insert
    await getRequest()
      .input('username', sql.VarChar, username)
      .input('uid', sql.Int, uid)
      .input('email', sql.VarChar, email)
      .input('block_flag', sql.Int, blockFlag)
      .input('token', sql.VarChar, token)
      .query(`
        INSERT INTO dbo.user_account (account, uid, forum_id, pay_stat, email, role, block_flag, register_token)
        VALUES (@username, @uid, @uid, 1014, @email, 'user', @block_flag, @token)
      `);

    // user_auth insert
    await getRequest()
      .input('username', sql.VarChar, username)
      .input('password', sql.VarChar, hexString)
      .query(`
        INSERT INTO dbo.user_auth (account, password, salt, hash_type)
        VALUES (@username, CONVERT(BINARY(128), @password), 0, 1)
      `);

    // user_data insert
    await getRequest()
      .input('uid', sql.Int, uid)
      .query(`
        INSERT INTO dbo.user_data (uid, user_data)
        VALUES (@uid, 0x0080C2E000D00B0C000000000CB40058)
      `);

    // user_server_group insert
    await getRequest()
      .input('uid', sql.Int, uid)
      .query(`
        INSERT INTO dbo.user_server_group (uid, server_group_id)
        VALUES (@uid, 1)
      `);

    if (transaction) await transaction.commit();

    if (blockFlag === 2) {
      const { renderTemplate } = require(global.BASE_DIR + '/services/mail/template');
      const confirmUrl = `${config.domain.startsWith('http') ? config.domain : 'https://' + config.domain}/register/confirm/${token}`;

      const html = await renderTemplate('register_confirm', {
        username,
        url: confirmUrl,
        siteName: config.siteName || 'CityVault'
      });

      await sendMail({
        to: email,
        subject: 'Account Registration Confirmation',
        html
      });

      req.flash('success', 'Account created. Please check your email to confirm.');
    } else {
      req.flash('success', 'Account created. You may now log in.');
    }

    return res.redirect('/login');
  } catch (err) {
    console.error('[Register Error]', err);

    // Cleanup fallback if no transaction support
    if (!transaction && uid) {
      try {
        const pool = await getAuthPool();

        await pool.request().input('uid', sql.Int, uid).query(`DELETE FROM dbo.user_account WHERE uid = @uid`);
        await pool.request().input('uid', sql.Int, uid).query(`DELETE FROM dbo.user_data WHERE uid = @uid`);
        await pool.request().input('uid', sql.Int, uid).query(`DELETE FROM dbo.user_server_group WHERE uid = @uid`);
        await pool.request().input('username', sql.VarChar, username).query(`DELETE FROM dbo.user_auth WHERE account = @username`);
      } catch (cleanupErr) {
        console.error('[Register Cleanup Failed]', cleanupErr);
      }
    }

    req.flash('error', 'Account creation failed.');
    return res.redirect('/register');
  }
}


async function handleConfirmAccount(req, res) {
  const token = req.params.token;
  try {
    const pool = await getAuthPool();

    const result = await pool.request()
      .input('token', sql.VarChar, token)
      .query(`SELECT account FROM dbo.user_account WHERE register_token = @token`);

    if (result.recordset.length === 0) {
      req.flash('error', 'Invalid or expired confirmation token.');
      return res.redirect('/login');
    }

    await pool.request()
      .input('token', sql.VarChar, token)
      .query(`
        UPDATE dbo.user_account
        SET register_token = NULL, block_flag = 0
        WHERE register_token = @token
      `);

    req.flash('success', '✅ Account confirmed. You may now log in!');
    req.session.returnTo = null;
    res.redirect('/login');
  } catch (err) {
    console.error('[Confirm Error]', err);
    req.flash('error', 'Could not confirm account.');
    req.session.returnTo = null;
    res.redirect('/login');
  }
}

module.exports = {
  handleRegisterPage,
  handleRegister,
  handleConfirmAccount
};
