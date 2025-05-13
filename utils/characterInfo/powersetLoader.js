const sql = require('mssql');

function formatDisplayName(name) {
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

async function getPoolsAndAncillaries(pool, containerId, buildNum = null) {
  const poolsQuery = `
    SELECT DISTINCT p.PowerSetName, a.Name
    FROM Powers p
    JOIN Attributes a ON p.PowerSetName = a.id
    WHERE p.ContainerID = @cid
      AND p.CategoryName = 35
      AND a.Name <> 'fitness'
      ${buildNum !== null ? 'AND BuildNum = @buildNum' : 'AND BuildNum IS NULL'}
  `;

  const ancillaryQuery = `
    SELECT DISTINCT p.PowerSetName, a.Name
    FROM Powers p
    JOIN Attributes a ON p.PowerSetName = a.id
    WHERE p.ContainerID = @cid
      AND p.CategoryName = 7171
      ${buildNum !== null ? 'AND BuildNum = @buildNum' : 'AND BuildNum IS NULL'}
  `;

  const request = pool.request().input('cid', sql.Int, containerId);
  if (buildNum !== null) request.input('buildNum', sql.Int, buildNum);

  const [poolsResult, ancillaryResult] = await Promise.all([
    request.query(poolsQuery),
    request.query(ancillaryQuery)
  ]);

  const pools = (poolsResult.recordset || []).map(row => formatDisplayName(row.Name));
  const ancillaries = (ancillaryResult.recordset || []).map(row => formatDisplayName(row.Name));

  return {
    pools,
    ancillaries
  };
}

module.exports = { getPoolsAndAncillaries };
