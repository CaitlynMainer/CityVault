const sql = require('mssql');
const dbConfig = require('../dbConfig');

async function listUsers(req, res) {
  const search = req.query.search || '';
  const limit = parseInt(req.query.limit)
    || parseInt(req.cookies.userListLimit)
    || 10;

  res.cookie('userListLimit', limit, { maxAge: 7 * 86400000 }); // 7 days

  const page = parseInt(req.query.page) || 1;
  const offset = (page - 1) * limit;

  try {
    const pool = await sql.connect(dbConfig);

    const searchLike = `%${search}%`;

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
      users: result.recordset,
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
    const pool = await sql.connect(dbConfig);
    await pool.request()
      .input('uid', sql.Int, uid)
      .input('newRole', sql.VarChar, newRole)
      .query(`UPDATE cohauth.dbo.user_account SET role = @newRole WHERE uid = @uid`);

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
  
    const blockFlag = action === 'ban' ? 1 : 0;
  
    try {
      const pool = await sql.connect(dbConfig);
      await pool.request()
        .input('uid', sql.Int, uid)
        .input('block_flag', sql.Int, blockFlag)
        .query(`UPDATE cohauth.dbo.user_account SET block_flag = @block_flag WHERE uid = @uid`);
  
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
