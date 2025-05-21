const sql = require('mssql');
const { getAuthPool } = require(global.BASE_DIR + '/db');
const { sendMail } = require(global.BASE_DIR + '/services/mail');
const { renderTemplate } = require(global.BASE_DIR + '/services/mail/template');
const { isGM } = require(global.BASE_DIR + '/utils/roles');

function getAccountStatus(flag) {
  if (flag & 1) return 'Banned';
  if (flag & 2) return 'Unconfirmed';
  return 'Active';
}

function getActionLabel(flag) {
  if (flag & 1) return 'Unban';
  if (flag & 2) return 'Confirm';
  return 'Ban';
}

async function listUsers(req, res) {
  if (!isGM(req.user?.role)) {
    return res.status(403).send('Forbidden');
  }
  const search = req.query.search || '';
  const searchLike = `%${search}%`;
  const limit = parseInt(req.query.limit) || parseInt(req.cookies.userListLimit) || 10;

  res.cookie('userListLimit', limit, { maxAge: 7 * 86400000 }); // 7 days

  const page = parseInt(req.query.page) || 1;
  const offset = (page - 1) * limit;

  try {
    const pool = await getAuthPool();

    const request = pool.request()
      .input('search', sql.VarChar, searchLike)
      .input('limit', sql.Int, limit)
      .input('offset', sql.Int, offset);

    const result = await request.query(`
      SELECT ua.uid, ua.account, ua.email, ua.role, ua.block_flag,
        (SELECT COUNT(*) FROM cohauth.dbo.user_notes un WHERE un.uid = ua.uid) AS noteCount
      FROM cohauth.dbo.user_account ua
      WHERE ua.account LIKE @search OR ua.email LIKE @search
      ORDER BY ua.account
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    // Add computed status and action
    const users = result.recordset.map(u => ({
      ...u,
      status: getAccountStatus(u.block_flag),
      actionLabel: getActionLabel(u.block_flag)
    }));

    const countResult = await pool.request()
      .input('search', sql.VarChar, searchLike)
      .query(`
        SELECT COUNT(*) AS total
        FROM cohauth.dbo.user_account
        WHERE account LIKE @search OR email LIKE @search
      `);

    const total = countResult.recordset[0].total;
    const totalPages = Math.max(Math.ceil(total / limit), 1);

    res.render('admin/users', {
      title: 'Admin Users',
      stylesheets: '<link rel="stylesheet" href="/css/admin.css">',
      scripts: '<script src="/js/admin.js"></script>',
      importmap: '',
      users,
      page,
      totalPages,
      search,
      limit
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error fetching users');
  }
}

async function updateUserRole(req, res) {
  if (!isGM(req.user?.role)) {
    return res.status(403).send('Forbidden');
  }
  const { uid } = req.params;
  const { newRole, page, search, limit } = req.body;

  if (!['user', 'gm', 'admin'].includes(newRole)) {
    return res.status(400).send('Invalid role');
  }

  const actingRole = req.user?.role;
  if (!actingRole) return res.status(403).send('Forbidden');

  const pool = await getAuthPool();
  const targetUser = await pool.request()
    .input('uid', sql.Int, uid)
    .query(`SELECT role FROM cohauth.dbo.user_account WHERE uid = @uid`);

  if (targetUser.recordset.length === 0) return res.status(404).send('User not found');
  const currentRole = targetUser.recordset[0].role;
  if (actingRole !== 'admin') {
    return res.status(403).send('Only admins can modify roles.');
  }

  if (currentRole === 'admin' && newRole !== 'admin') {
    return res.status(403).send('Admins cannot be demoted through the panel.');
  }

  if (targetUser.account === req.session.username) {
    return res.status(403).send('You cannot change your own role.');
  }
  // Final enforcement
  if (actingRole !== 'admin') {
    return res.status(403).send('Only admins can modify roles.');
  }

  if (currentRole === 'admin' && newRole !== 'admin') {
    return res.status(403).send('Admins cannot be demoted through the panel.');
  }

  try {
    const pool = await getAuthPool();

    await pool.request()
      .input('uid', sql.Int, uid)
      .input('newRole', sql.VarChar, newRole)
      .query(`
        UPDATE cohauth.dbo.user_account
        SET role = @newRole
        WHERE uid = @uid
      `);

    const qs = `?page=${page}&search=${encodeURIComponent(search)}&limit=${limit}`;
    res.redirect('/admin/users' + qs);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error updating role');
  }
}

async function toggleUserBan(req, res) {
  if (!isGM(req.user?.role)) {
    return res.status(403).send('Forbidden');
  }

  const { uid } = req.params;
  const { action, page, search, limit, reason = '' } = req.body;

  const qs = `?page=${page}&search=${encodeURIComponent(search)}&limit=${limit}`;

  try {
    const pool = await getAuthPool();

    // Get the target user's role and email first
    const userResult = await pool.request()
      .input('uid', sql.Int, uid)
      .query(`SELECT account, email, role FROM cohauth.dbo.user_account WHERE uid = @uid`);

    const user = userResult.recordset[0];

    if (!user) {
      req.flash('error', 'User not found.');
      return res.redirect('/admin/users' + qs);
    }

    // Prevent banning or unbanning of Admin users
    if (user.role === 'admin') {
      req.flash('error', 'You cannot ban or unban Admin users.');
      return res.redirect('/admin/users' + qs);
    }

    // Prevent GMs from banning or unbanning other GMs
    if (req.user.role === 'gm' && user.role === 'gm') {
      req.flash('error', 'GMs cannot ban or unban other GMs.');
      return res.redirect('/admin/users' + qs);
    }

    let query;
    if (action === 'ban') {
      query = `UPDATE cohauth.dbo.user_account SET block_flag = 1 WHERE uid = @uid`;
    } else if (action === 'unban') {
      query = `UPDATE cohauth.dbo.user_account SET block_flag = 0 WHERE uid = @uid`;
    } else if (action === 'confirm') {
      query = `UPDATE cohauth.dbo.user_account SET block_flag = block_flag & ~2 WHERE uid = @uid`;
    } else {
      return res.status(400).send('Invalid action');
    }

    await pool.request().input('uid', sql.Int, uid).query(query);

    // Send email notification if applicable
    if (user?.email) {
      let html;
      if (action === 'ban') {
        html = await renderTemplate('user_banned', {
          username: user.account,
          reason
        });
        await sendMail({
          to: user.email,
          subject: 'Your account has been banned',
          html
        });
      } else if (action === 'unban') {
        html = await renderTemplate('user_unbanned', {
          username: user.account,
          reason
        });
        await sendMail({
          to: user.email,
          subject: 'Your account has been unbanned',
          html
        });
      }
    }

    res.redirect('/admin/users' + qs);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error updating block flag');
  }
}


// Fetch notes for a user
async function getUserNotes(req, res) {
  if (!isGM(req.user?.role)) {
    return res.status(403).send('Forbidden');
  }
  const uid = parseInt(req.params.uid, 10);
  if (isNaN(uid)) {
    return res.status(400).json({ success: false, error: 'Invalid user ID.' });
  }

  try {
    const pool = await getAuthPool();
    const result = await pool.request()
      .input('uid', sql.Int, uid)
      .query(`
        SELECT id, created_at, author, note
        FROM cohauth.dbo.user_notes
        WHERE uid = @uid
        ORDER BY created_at DESC
      `);
    res.json({ success: true, notes: result.recordset });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch notes.' });
  }
}


// Add a new note
async function addUserNote(req, res) {
  if (!isGM(req.user?.role)) {
    return res.status(403).send('Forbidden');
  }
  const uid = parseInt(req.params.uid, 10);
  const note = req.body.note?.trim();
  const author = req.session.username;

  if (isNaN(uid)) {
    return res.status(400).json({ success: false, error: 'Invalid user ID.' });
  }

  if (!note) {
    return res.status(400).json({ success: false, error: 'Note is required.' });
  }

  try {
    const pool = await getAuthPool();
    await pool.request()
      .input('uid', sql.Int, uid)
      .input('note', sql.Text, note)
      .input('author', sql.VarChar, author)
      .query(`
        INSERT INTO cohauth.dbo.user_notes (uid, note, author)
        VALUES (@uid, @note, @author)
      `);
    res.json({ success: true });
  } catch (err) {
    console.error('[Add Note Error]', err);
    res.status(500).json({ success: false, error: 'Failed to add note.' });
  }
}

module.exports = {
  listUsers,
  updateUserRole,
  toggleUserBan,
  getUserNotes,
  addUserNote
};
