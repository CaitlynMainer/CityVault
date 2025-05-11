const sql = require('mssql');
const path = require('path');
const fs = require('fs');

// Load config from JSON
const configPath = path.join(__dirname, '../data/config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const authConfig = {
  user: config.auth.dbUser,
  password: config.auth.dbPass,
  server: config.auth.dbHost,
  database: config.auth.dbName,
  port: config.auth.dbPort,
  options: {
    trustServerCertificate: true
  }
};

// Auth DB pool
let authPool = null;
async function getAuthPool() {
  if (!authPool) {
    const pool = new sql.ConnectionPool(authConfig);
    authPool = await pool.connect();
  }
  return authPool;
}

// Game server pools
const gamePools = {};

async function getGamePool(serverKey) {
  if (!config.servers[serverKey]) {
    throw new Error(`Unknown server key: ${serverKey}`);
  }

  if (!gamePools[serverKey]) {
    const s = config.servers[serverKey];
    const pool = new sql.ConnectionPool({
      user: s.dbUser,
      password: s.dbPass,
      server: s.dbHost,
      database: s.dbName,
      port: s.dbPort,
      options: {
        trustServerCertificate: true
      }
    });

    gamePools[serverKey] = await pool.connect();
  }

  return gamePools[serverKey];
}

module.exports = {
  getAuthPool,
  getGamePool
};
