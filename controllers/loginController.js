const sql = require('mssql');
const { gameHashPassword } = require('../utils/hashUtils');
const { getAuthPool } = require(global.BASE_DIR + '/db');
const { sendMail } = require('../services/mail');
const crypto = require('crypto');
const config = require(global.BASE_DIR + '/utils/config');

function handleLoginPage(req, res) {
  res.render('login');
}

async function handleLogin(req, res) {
  const { username, password } = req.body;
  const rawHash = gameHashPassword(username, password); // 64-byte Buffer
  const hexString = rawHash.toString('hex'); // 128-char hex string
  const sqlStyleBuffer = Buffer.from(hexString, 'utf8');

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
    } else if (user.block_flag === 2) {
      req.flash('error', 'Your account has not been confirmed via email.');
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

async function handleResetPage(req, res) {
    res.render('reset', {
    messages: {
      error: req.flash('error'),
      success: req.flash('success')
    }
  });
}

async function handleResetRequest(req, res) {
  const { email } = req.body;
  try {
    const pool = await getAuthPool();

    const user = await pool.request()
      .input('email', sql.VarChar, email)
      .query('SELECT account FROM dbo.user_account WHERE email = @email');

    if (user.recordset.length === 0) {
      req.flash('error', 'Email not found.');
      return res.redirect('/login/reset');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = Date.now() + 1000 * 60 * 15; // 15 minutes
    const username = user.recordset[0].account;
    await pool.request()
      .input('email', sql.VarChar, email)
      .input('token', sql.VarChar, token)
      .input('expires', sql.BigInt, expires)
      .query(`
        UPDATE dbo.user_account
        SET reset_token = @token, reset_expires = @expires
        WHERE email = @email
      `);

    const resetUrl = `${config.domain.startsWith('http') ? '' : 'https://'}${config.domain}/login/reset/confirm?token=${token}`;

    const { renderTemplate } = require(global.BASE_DIR + '/services/mail/template');

    const html = await renderTemplate('reset_password', {
      username,
      url: resetUrl,
      siteName: config.siteName || 'CityVault'
    });

    await sendMail({
      to: email,
      subject: 'Password Reset Request',
      html
    });

    req.flash('success', 'Password reset link sent.');
    res.redirect('/login');
  } catch (err) {
    console.error('[Reset Error]', err);
    req.flash('error', 'An error occurred.');
    res.redirect('/login/reset');
  }
}

async function handleResetConfirmPage(req, res) {
  const { token } = req.query;
  if (!token) {
    req.flash('error', 'Missing token.');
    return res.redirect('/login');
  }

  try {
    const pool = await getAuthPool();
    const result = await pool.request()
      .input('token', sql.VarChar, token)
      .query('SELECT account, reset_expires FROM dbo.user_account WHERE reset_token = @token');

    if (result.recordset.length === 0) {
      req.flash('error', 'Invalid or expired reset link.');
      return res.redirect('/login');
    }

    const { reset_expires } = result.recordset[0];
    if (Date.now() > parseInt(reset_expires)) {
      req.flash('error', 'Reset link has expired.');
      return res.redirect('/login');
    }

    res.render('reset-confirm', {
      token,
      messages: {
        error: req.flash('error'),
        success: req.flash('success')
      }
    });
  } catch (err) {
    console.error('[Reset Confirm Error]', err);
    req.flash('error', 'Could not verify token.');
    res.redirect('/login');
  }
}

async function handleResetConfirm(req, res) {
  const { token, password } = req.body;
  if (!token || !password) {
    req.flash('error', 'Missing token or password.');
    return res.redirect('/login');
  }

  try {
    const pool = await getAuthPool();
    const result = await pool.request()
      .input('token', sql.VarChar, token)
      .query('SELECT account FROM dbo.user_account WHERE reset_token = @token');

    if (result.recordset.length === 0) {
      req.flash('error', 'Invalid or expired reset token.');
      return res.redirect('/login');
    }

    const account = result.recordset[0].account;
    const hashed = gameHashPassword(account, password);
    const hex = hashed.toString('hex');
    const sqlBuffer = Buffer.from(hex, 'utf8');

    await pool.request()
      .input('account', sql.VarChar, account)
      .input('hash', sql.VarBinary(128), sqlBuffer)
      .query(`
        UPDATE dbo.user_auth
        SET password = @hash
        WHERE account = @account;

        UPDATE dbo.user_account
        SET reset_token = NULL, reset_expires = NULL
        WHERE account = @account;
      `);

    req.flash('success', 'Password updated successfully. You may now log in.');
    res.redirect('/login');
  } catch (err) {
    console.error('[Reset Confirm Save Error]', err);
    req.flash('error', 'Failed to reset password.');
    res.redirect('/login');
  }
}

module.exports = {
  handleLoginPage,
  handleLogin,
  handleResetPage,
  handleResetRequest,
  handleResetConfirmPage,
  handleResetConfirm
};
