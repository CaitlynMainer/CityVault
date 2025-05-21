const sql = require('mssql');
const { getAuthPool } = require(global.BASE_DIR + '/db');
const { isAdmin } = require(global.BASE_DIR + '/utils/roles');

async function listServers(req, res) {
  if (!isAdmin(req.user?.role)) {
    return res.status(403).send('Forbidden');
  }
  try {
    const pool = await getAuthPool();
    const result = await pool.request().query('SELECT id, name, ip, inner_ip, server_group_id FROM dbo.server ORDER BY id');

    res.render('admin/servers', {
      servers: result.recordset,
      messages: req.flash()
    });
  } catch (err) {
    console.error('[Admin] Failed to list servers:', err);
    req.flash('error', 'Failed to fetch servers.');
    res.redirect('/admin');
  }
}

async function saveServer(req, res) {
  if (!isAdmin(req.user?.role)) {
    return res.status(403).send('Forbidden');
  }
  const { id, name, ip, inner_ip, server_group_id } = req.body;

  try {
    const pool = await getAuthPool();
    const request = pool.request()
      .input('name', sql.VarChar, name)
      .input('ip', sql.VarChar, ip)
      .input('inner_ip', sql.VarChar, inner_ip)
      .input('server_group_id', sql.Int, server_group_id || 1);

    if (id) {
      await request.input('id', sql.Int, id).query(`
        UPDATE dbo.server SET name = @name, ip = @ip, inner_ip = @inner_ip, server_group_id = @server_group_id WHERE id = @id
      `);
      req.flash('success', 'Server updated.');
    } else {
      await request.query(`
        INSERT INTO dbo.server (name, ip, inner_ip, server_group_id)
        VALUES (@name, @ip, @inner_ip, @server_group_id)
      `);
      req.flash('success', 'Server added.');
    }

    res.redirect('/admin/servers');
  } catch (err) {
    console.error('[Admin] Failed to save server:', err);
    req.flash('error', 'Failed to save server.');
    res.redirect('/admin/servers');
  }
}

async function deleteServer(req, res) {
  const id = parseInt(req.params.id);
  try {
    const pool = await getAuthPool();
    await pool.request().input('id', sql.Int, id).query('DELETE FROM dbo.server WHERE id = @id');
    req.flash('success', 'Server deleted.');
  } catch (err) {
    console.error('[Admin] Failed to delete server:', err);
    req.flash('error', 'Failed to delete server.');
  }
  res.redirect('/admin/servers');
}

module.exports = {
  listServers,
  saveServer,
  deleteServer
};
