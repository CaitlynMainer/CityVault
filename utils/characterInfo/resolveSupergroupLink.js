const sql = require('mssql');

async function resolveSupergroupLink(pool, supergroupId) {
  if (!supergroupId) return null;
  const result = await pool.request()
    .input('sgid', sql.Int, supergroupId)
    .query('SELECT Name FROM dbo.Supergroups WHERE ContainerId = @sgid');
  const name = result.recordset[0]?.Name;
  return name ? { id: supergroupId, name } : null;
}
module.exports = { resolveSupergroupLink };
