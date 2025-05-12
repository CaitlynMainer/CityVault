const sql = require('mssql');
const { extractGlobalName } = require('../globalName');
const { getChatPool } = require('../../db');

async function getGlobalHandle(authId) {
  try {
    const chatPool = await getChatPool();
    const result = await chatPool.request()
      .input('authId', sql.Int, authId)
      .query('SELECT data FROM dbo.users WHERE user_id = @authId');
    return extractGlobalName(result.recordset[0]?.data || '');
  } catch (e) {
    console.warn(`Could not retrieve global handle for AuthId ${authId}`, e);
    return null;
  }
}
module.exports = { getGlobalHandle };
