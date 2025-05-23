// utils/costumeHash.js
const sql = require('mssql');

/**
 * Check if a costume hash already exists.
 */
async function checkCostumeHash(pool, serverKey, containerId, slotId, hash) {
  const result = await pool.request()
    .input('server', sql.VarChar, serverKey)
    .input('cid', sql.Int, containerId)
    .input('slot', sql.VarChar, slotId)
    .input('hash', sql.VarChar, hash)
    .query(`
      SELECT 1 FROM cohauth.dbo.CostumeHash
      WHERE ServerKey = @server AND ContainerId = @cid AND SlotId = @slot AND Hash = @hash
    `);

  return result.recordset.length > 0;
}

/**
 * Update or insert a costume hash.
 */
async function updateCostumeHash(pool, serverKey, containerId, slotId, hash) {
  await pool.request()
    .input('server', sql.VarChar, serverKey)
    .input('cid', sql.Int, containerId)
    .input('slot', sql.VarChar, slotId)
    .query(`
      DELETE FROM cohauth.dbo.CostumeHash
      WHERE ServerKey = @server AND ContainerId = @cid AND SlotId = @slot
    `);

  await pool.request()
    .input('server', sql.VarChar, serverKey)
    .input('cid', sql.Int, containerId)
    .input('slot', sql.VarChar, slotId)
    .input('hash', sql.VarChar, hash)
    .query(`
      INSERT INTO cohauth.dbo.CostumeHash (ServerKey, ContainerId, SlotId, Hash)
      VALUES (@server, @cid, @slot, @hash)
    `);
}

module.exports = {
  checkCostumeHash,
  updateCostumeHash
};
