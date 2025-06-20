const readline = require('readline');
const crypto = require('crypto');
const { gameHashPassword } = require(global.BASE_DIR + '/utils/hashUtils');
const { servers } = require(global.BASE_DIR + '/utils/config');
const { getAuthPool, sql } = require(global.BASE_DIR + '/db/index');


async function ensureSchema(authConfig) {
  try {
    const pool = await getAuthPool();
    await ensureAuthSchema(pool);
    await ensureInitialAdmin(pool);

  } catch (err) {
    console.error("[ERROR] Failed to ensure schema:", err);
  }
}

async function ensureInitialAdmin(pool) {
  const userCount = await pool.request().query(
    `SELECT COUNT(*) AS count FROM cohauth.dbo.user_account`
  );

  if (userCount.recordset[0].count === 0) {
    console.log("[WARN] No users found. Creating initial admin account...");

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const ask = (q) => new Promise(resolve => rl.question(q, resolve));

    const username = await ask("Enter a username: ");
    const password = await ask("Enter a password: ");
    const email = await ask("Enter an email (optional): ");
    rl.close();

    const blockFlag = 0;
    const token = crypto.randomBytes(32).toString('hex');
    const hexString = gameHashPassword(password, username);

    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    const tRequest = new sql.Request(transaction);

    const uidResult = await tRequest.query(`SELECT ISNULL(MAX(uid), 0) + 1 AS newID FROM dbo.user_account`);
    const uid = uidResult.recordset[0].newID;

    await tRequest
      .input('username', sql.VarChar, username)
      .input('uid', sql.Int, uid)
      .input('email', sql.VarChar, email || null)
      .input('block_flag', sql.Int, blockFlag)
      .input('token', sql.VarChar, token)
      .query(`
        INSERT INTO dbo.user_account (account, uid, forum_id, pay_stat, email, role, block_flag)
        VALUES (@username, @uid, @uid, 1014, @email, 'admin', @block_flag)
      `);

    await tRequest
      .input('password', sql.VarChar, hexString)
      .query(`
        INSERT INTO dbo.user_auth (account, password, salt, hash_type)
        VALUES (@username, CONVERT(BINARY(128), @password), 0, 1)
      `);

    await tRequest.query(`INSERT INTO dbo.user_data (uid, user_data) VALUES (@uid, 0x0080C2E000D00B0C000000000CB40058)`);
    await tRequest.query(`INSERT INTO dbo.user_server_group (uid, server_group_id) VALUES (@uid, 1)`);

    await transaction.commit();

    console.log(`[SUCCESS] Admin account '${username}' created.`);
  } else {
    const adminCheck = await pool.request().query(
      `SELECT COUNT(*) AS count FROM cohauth.dbo.user_account WHERE role = 'admin'`
    );

    if (adminCheck.recordset[0].count === 0) {
      console.log("[WARN] No admin user found.");
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      rl.question("Enter the AuthName of the user to promote to admin: ", async (authName) => {
        rl.close();

        const userCheck = await pool.request()
          .input('authName', sql.VarChar, authName)
          .query(`SELECT uid FROM cohauth.dbo.user_account WHERE account = @authName`);

        if (userCheck.recordset.length === 0) {
          console.log(`[ERROR] No user found with AuthName "${authName}".`);
        } else {
          const uid = userCheck.recordset[0].uid;
          await pool.request()
            .input('uid', sql.Int, uid)
            .query(`UPDATE cohauth.dbo.user_account SET role = 'admin' WHERE uid = @uid`);
          console.log(`[SUCCESS] User "${authName}" has been promoted to admin.`);
        }
      });
    }
  }
}

async function ensureAuthSchema(pool) {
  const checks = [
    { column: 'email', query: "ALTER TABLE cohauth.dbo.user_account ADD email VARCHAR(254) NULL;" },
    { column: 'role', query: "ALTER TABLE cohauth.dbo.user_account ADD role VARCHAR(16) NOT NULL DEFAULT 'user';" },
    { column: 'tracker', query: "ALTER TABLE cohauth.dbo.user_account ADD tracker VARCHAR(1) NOT NULL DEFAULT '1';" },
    { column: 'reset_token', query: "ALTER TABLE cohauth.dbo.user_account ADD reset_token VARCHAR(128) NULL;" },
    { column: 'reset_expires', query: "ALTER TABLE cohauth.dbo.user_account ADD reset_expires BIGINT NULL;" },
    { column: 'register_token', query: "ALTER TABLE cohauth.dbo.user_account ADD register_token VARCHAR(128) NULL;" },
    { column: 'block_flag', query: "ALTER TABLE cohauth.dbo.user_account ADD block_flag INT NOT NULL DEFAULT 0;" }
  ];

  for (const check of checks) {
    const exists = await pool.request().query(`
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'user_account' AND COLUMN_NAME = '${check.column}'
    `);
    if (exists.recordset.length === 0) {
      console.log(`[INFO] Adding '${check.column}' column to user_account...`);
      await pool.request().query(check.query);
      console.log(`[INFO] '${check.column}' column added.`);
    }
  }

  const tableExists = await pool.request().query(`
    SELECT * FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_NAME = 'user_notes' AND TABLE_SCHEMA = 'dbo'
  `);

  if (tableExists.recordset.length === 0) {
    console.log('[INFO] Creating user_notes table...');
    await pool.request().query(`
      CREATE TABLE cohauth.dbo.user_notes (
        id INT IDENTITY(1,1) PRIMARY KEY,
        uid INT NOT NULL,
        created_at DATETIME DEFAULT GETUTCDATE(),
        author VARCHAR(50) NOT NULL,
        note TEXT NOT NULL
      );
    `);
    console.log('[INFO] user_notes table created.');
  }

  const hashTableExists = await pool.request().query(`
    SELECT * FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_NAME = 'CostumeHash' AND TABLE_SCHEMA = 'dbo'
  `);

  if (hashTableExists.recordset.length === 0) {
    console.log('[INFO] Creating CostumeHash table...');
    await pool.request().query(`
      CREATE TABLE cohauth.dbo.CostumeHash (
        ServerKey VARCHAR(32) NOT NULL,
        ContainerId INT NOT NULL,
        SlotId VARCHAR(10) NOT NULL,
        Hash VARCHAR(64) NOT NULL,
        PRIMARY KEY (ServerKey, ContainerId, SlotId)
      );
    `);
    console.log('[INFO] CostumeHash table created.');
  }
  // PetitionComments
  const commentsCheck = await pool.request().query(`
    SELECT * FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_NAME = 'PetitionComments' AND TABLE_SCHEMA = 'dbo'
  `);
  if (commentsCheck.recordset.length === 0) {
    console.log('[INFO] Creating PetitionComments table...');
    await pool.request().query(`
      CREATE TABLE dbo.PetitionComments (
        id INT IDENTITY(1,1) PRIMARY KEY,
        server VARCHAR(32) NOT NULL,
        petitionId INT NOT NULL,
        author VARCHAR(50) NOT NULL,
        is_admin BIT NOT NULL DEFAULT 0,
        content TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT GETUTCDATE()
      );
    `);
  }

  // PetitionNotifications
  const notifyCheck = await pool.request().query(`
    SELECT * FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_NAME = 'PetitionNotifications' AND TABLE_SCHEMA = 'dbo'
  `);
  if (notifyCheck.recordset.length === 0) {
    console.log('[INFO] Creating PetitionNotifications table...');
    await pool.request().query(`
      CREATE TABLE dbo.PetitionNotifications (
        id INT IDENTITY(1,1) PRIMARY KEY,
        server VARCHAR(32) NOT NULL,
        petitionId INT NOT NULL,
        notified BIT NOT NULL DEFAULT 0,
        detected_at DATETIME NOT NULL DEFAULT GETUTCDATE()
      );
    `);
  }

}

module.exports = ensureSchema;
