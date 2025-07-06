// oauthModel.js
const sql = require('mssql');
const { getAuthPool } = require(global.BASE_DIR + '/db');
const { gameHashPassword } = require('../utils/hashUtils');

module.exports = {
  // Used to validate client credentials
    getClient: async (clientId, clientSecret) => {
    if (clientId === 'cityvault_client') {
        return {
        id: clientId,
        grants: ['password', 'refresh_token'],
        redirectUris: []
        };
    }
    return null;
    },

  // Validate username/password
  getUser: async (username, password) => {
    const hashBuffer = gameHashPassword(username, password);
    const hex = hashBuffer.toString('hex');
    const mssqlBuffer = Buffer.from(hex, 'utf8');

    const pool = await getAuthPool();
    const result = await pool.request()
      .input('username', sql.VarChar, username)
      .query(`
        SELECT ua.uid, ua.account, ua.role, ua.block_flag, auth.password
        FROM dbo.user_account ua
        JOIN dbo.user_auth auth ON ua.account = auth.account
        WHERE ua.account = @username
      `);

    const user = result.recordset[0];
    if (!user || user.block_flag === 1) return null;
    if (!user.password.equals(mssqlBuffer)) return null;

    return {
      id: user.uid,
      username: user.account,
      role: user.role
    };
  },

  // Called when a token is issued
  saveToken: async (token, client, user) => {
    token.client = { id: client.id };
    token.user = { id: user.id, username: user.username };
    return token;
  },

  // Retrieves token info (used for refresh flow, etc.)
  getAccessToken: async (accessToken) => {
    // In-memory for now, use Redis/db in prod
    return null;
  },

  // Optional
  getRefreshToken: async (refreshToken) => null,
  revokeToken: async (token) => true
};
