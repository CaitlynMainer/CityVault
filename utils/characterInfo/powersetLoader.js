const sql = require('mssql');
const { getAttributeIdByName } = require(global.BASE_DIR + '/utils/attributeMap');

function formatDisplayName(name) {
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

async function getPoolsAndAncillaries(pool, containerId, serverKey, buildNum = null) {
  const epicID = getAttributeIdByName(serverKey, 'Epic');
  const poolID = getAttributeIdByName(serverKey, 'Pool');

  const poolsQuery = `
  SELECT DISTINCT p.PowerSetName, a.Name
  FROM Powers p
  JOIN Attributes a ON p.PowerSetName = a.id
  WHERE p.ContainerID = @cid
    AND p.CategoryName = ${poolID}
    AND a.Name <> 'fitness'
    ${buildNum !== null ? 'AND BuildNum = @buildNum' : 'AND BuildNum IS NULL'}
`;

  const ancillaryQuery = `
  SELECT DISTINCT p.PowerSetName, a.Name
  FROM Powers p
  JOIN Attributes a ON p.PowerSetName = a.id
  WHERE p.ContainerID = @cid
    AND p.CategoryName = ${epicID}
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
