const path = require('path');
const sql = require('mssql');
const { getGamePool, getAuthPool } = require(global.BASE_DIR + '/db');
const { renderFullShot } = require(global.BASE_DIR + '/services/renderFullShot');
const { fetchCostumeData } = require(global.BASE_DIR + '/services/fetchCostumeData');

const config = require(path.join(global.BASE_DIR, 'data', 'config.json'));
const servers = config.servers;

const BATCH_SIZE = 15;
const INITIAL_PULL = 50; // pull extra to account for already-rendered

async function renderCharacterCostumes() {
  const authPool = await getAuthPool();

  for (const serverKey of Object.keys(servers)) {
    const pool = await getGamePool(serverKey);

    let result;
    try {
      result = await pool.request().query(`
        SELECT TOP (${INITIAL_PULL}) ContainerId, CurrentCostume
        FROM dbo.Ents
        WHERE CurrentCostume IS NOT NULL AND ContainerId IS NOT NULL
        ORDER BY NEWID()
      `);
    } catch (err) {
      console.error(`[RenderTask] Failed querying server ${serverKey}:`, err.message);
      continue;
    }

    const containerIds = result.recordset.map(r => r.ContainerId);

    if (!containerIds.length) continue;

    // Build a query for existing hashes
    const req = authPool.request();
    containerIds.forEach((id, i) => {
      req.input(`id${i}`, sql.Int, id);
    });

    const idPlaceholders = containerIds.map((_, i) => `@id${i}`).join(',');

    let existingHashes;
    try {
      req.input('serverKey', sql.VarChar, serverKey);
      existingHashes = await req.query(`
        SELECT ContainerId FROM dbo.CostumeHash
        WHERE ServerKey = @serverKey AND SlotId = '0_body' AND ContainerId IN (${idPlaceholders})
      `, { serverKey });
    } catch (err) {
      console.error(`[RenderTask] Failed querying auth hashes for ${serverKey}:`, err.message);
      continue;
    }

    const seen = new Set(existingHashes.recordset.map(r => r.ContainerId));

    const toRender = result.recordset
      .filter(row => !seen.has(row.ContainerId))
      .slice(0, BATCH_SIZE);

      const skipped = result.recordset.filter(row => seen.has(row.ContainerId));

console.log(`[RenderTask] ${serverKey}: Pulled ${result.recordset.length}, Skipped ${skipped.length}, To Render ${toRender.length}`);

if (skipped.length > 0) {
  console.log(`[RenderTask] ${serverKey}: Skipped ContainerIds: ${skipped.map(r => r.ContainerId).join(', ')}`);
}


    for (const row of toRender) {
      try {
        await renderFullShot(
          authPool,
          pool,
          serverKey,
          row.ContainerId,
          0,
          fetchCostumeData,
          false
        );
      } catch (err) {
        console.error(`[RenderTask] Error rendering ContainerId ${row.ContainerId} on ${serverKey}:`, err.message);
      }
    }
  }
}

module.exports = { renderCharacterCostumes };
