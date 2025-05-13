const sql = require('mssql');
const config = require(global.BASE_DIR + '/utils/config');

// Auth DB pool
let authPool = null;
async function getAuthPool() {
  if (!authPool) {
    const pool = new sql.ConnectionPool({
      user: config.auth.dbUser,
      password: config.auth.dbPass,
      server: config.auth.dbHost,
      database: config.auth.dbName,
      port: config.auth.dbPort,
      options: {
        trustServerCertificate: true
      }
    });
    authPool = await pool.connect();
  }
  return authPool;
}

// Game server pools
const gamePools = {};

async function getGamePool(serverKey) {
  const serverConfig = config.servers[serverKey];
  if (!serverConfig) {
    throw new Error(`Unknown server key: ${serverKey}`);
  }

  if (!gamePools[serverKey]) {
    const pool = new sql.ConnectionPool({
      user: serverConfig.dbUser,
      password: serverConfig.dbPass,
      server: serverConfig.dbHost,
      database: serverConfig.dbName,
      port: serverConfig.dbPort,
      options: {
        trustServerCertificate: true
      }
    });

    gamePools[serverKey] = await pool.connect();
  }

  return gamePools[serverKey];
}

// Global chat DB pool
let chatPool = null;
async function getChatPool() {
  if (!chatPool) {
    const chatConfig = config.chat;
    const fallback = config.auth;
    const pool = new sql.ConnectionPool({
      user: chatConfig.dbUser || fallback.dbUser,
      password: chatConfig.dbPass || fallback.dbPass,
      server: chatConfig.dbHost || fallback.dbHost,
      database: chatConfig.dbName || 'cohchat',
      port: chatConfig.dbPort || fallback.dbPort || 1433,
      options: {
        trustServerCertificate: true
      }
    });

    chatPool = await pool.connect();
  }
  return chatPool;
}

module.exports = {
  getAuthPool,
  getGamePool,
  getChatPool
};