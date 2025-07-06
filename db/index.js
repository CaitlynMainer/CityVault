const sql = require('mssql');
const config = require(global.BASE_DIR + '/utils/config');
const os = require('os');

function buildPoolConfig(cfg) {
  const dbHost = (cfg.dbHost || '').trim();
  const dbName = cfg.dbName;
  const dbUser = cfg.dbUser || '';
  const dbPass = cfg.dbPass || '';
  const dbPort = cfg.dbPort || 1433;
  const isWindows = os.platform() === 'win32';

  // Force LocalDB check BEFORE matching anything else
  if (isWindows && dbHost.toLowerCase().startsWith('localdb')) {
    const instance = dbHost.split('\\')[1] || 'MSSQLLocalDB';
    return {
      driver: 'msnodesqlv8',
      connectionString: `Server=(localdb)\\${instance};Database=${dbName};Integrated Security=True;Trusted_Connection=Yes;Driver={ODBC Driver 17 for SQL Server}`
    };
  }

  // Otherwise handle named instance
  const instanceMatch = dbHost.match(/^(.+?)\\(.+)$/);
  if (instanceMatch) {
    const [, host, instance] = instanceMatch;
    return {
      driver: 'tedious',
      server: host,
      database: dbName,
      user: dbUser,
      password: dbPass,
      options: {
        trustServerCertificate: true,
        instanceName: instance
      }
    };
  }

  // Default fallback (IP or hostname with optional port)
  return {
    driver: 'tedious',
    server: dbHost,
    database: dbName,
    user: dbUser,
    password: dbPass,
    port: dbPort,
    options: {
      trustServerCertificate: true
    }
  };
}


async function connectPool(cfg) {
  const driverName = cfg.driver;
  const driverModule = driverName === 'msnodesqlv8'
    ? require('mssql/msnodesqlv8')
    : require('mssql');

  const conn = new driverModule.ConnectionPool(cfg);
  conn._driver = driverModule; // store actual module for .Int etc
  await conn.connect();
  //console.log('[DB DEBUG] Connected using driver:', driverName);
  return conn;
}


let authPool = null;
async function getAuthPool() {
  if (!authPool) {
    const poolCfg = buildPoolConfig(config.auth);
    authPool = await connectPool(poolCfg);

    const { recordset } = await authPool.request().query('SELECT DB_NAME() AS db');
    const actualDb = recordset[0].db;

    if (actualDb.toLowerCase() !== config.auth.dbName.toLowerCase()) {
      throw new Error(`[CRITICAL] Mismatched Auth DB: expected ${config.auth.dbName}, got ${actualDb}`);
    }

    //console.log('[DB DEBUG] Connected to Auth DB:', actualDb);
  }

  return authPool;
}

let chatPool = null;
async function getChatPool() {
  if (!chatPool) {
    const mergedCfg = { ...config.auth, ...config.chat };
    const poolCfg = buildPoolConfig(mergedCfg);
    chatPool = await connectPool(poolCfg);

    const { recordset } = await chatPool.request().query('SELECT DB_NAME() AS db');
    const actualDb = recordset[0].db;

    if (actualDb.toLowerCase() !== config.chat.dbName.toLowerCase()) {
      throw new Error(`[CRITICAL] Mismatched Chat DB: expected ${config.chat.dbName}, got ${actualDb}`);
    }

    //console.log('[DB DEBUG] Connected to Chat DB:', actualDb);
  }
  return chatPool;
}

const gamePools = {};
async function getGamePool(serverKey) {
  const cfg = config.servers[serverKey];
  if (!cfg) throw new Error(`[DB] Unknown server key: ${serverKey}`);

  if (!gamePools[serverKey]) {
    const poolCfg = buildPoolConfig(cfg);
    gamePools[serverKey] = await connectPool(poolCfg);

    const { recordset } = await gamePools[serverKey].request().query('SELECT DB_NAME() AS db');
    const actualDb = recordset[0].db;

    if (actualDb.toLowerCase() !== cfg.dbName.toLowerCase()) {
      throw new Error(`[CRITICAL] Mismatched Game DB: expected ${cfg.dbName}, got ${actualDb}`);
    }
  }

  return gamePools[serverKey];
}

function createPool(cfg) {
  const poolCfg = buildPoolConfig(cfg);
  return connectPool(poolCfg);
}

module.exports = {
  getAuthPool,
  getChatPool,
  getGamePool,
  createPool,
  sql
};
