const sql = require('mssql');
const { getAuthPool } = require(global.BASE_DIR + '/db');

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
      SELECT uid, account, email, role, block_flag
      FROM cohauth.dbo.user_account
      WHERE account LIKE @search OR email LIKE @search
      ORDER BY account
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
      role: req.session.role,
      users,
      username: req.session.username,
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
  const { uid } = req.params;
  const { newRole, page, search, limit } = req.body;

  if (!['user', 'admin'].includes(newRole)) {
    return res.status(400).send('Invalid role');
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
  const { uid } = req.params;
  const { action, page, search, limit } = req.body;

  try {
    const pool = await getAuthPool();

    let query;
    if (action === 'ban') {
      query = `UPDATE cohauth.dbo.user_account SET block_flag = 1 WHERE uid = @uid`;
    } else if (action === 'unban') {
      query = `UPDATE cohauth.dbo.user_account SET block_flag = 0 WHERE uid = @uid`;
    } else if (action === 'confirm') {
      query = `UPDATE cohauth.dbo.user_account SET block_flag = block_flag & ~2 WHERE uid = @uid`; // Clear bit 2
    } else {
      return res.status(400).send('Invalid action');
    }

    await pool.request().input('uid', sql.Int, uid).query(query);

    const qs = `?page=${page}&search=${encodeURIComponent(search)}&limit=${limit}`;
    res.redirect('/admin/users' + qs);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error updating block flag');
  }
}


module.exports = {
  listUsers,
  updateUserRole,
  toggleUserBan
};
