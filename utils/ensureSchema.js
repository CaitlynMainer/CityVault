const sql = require('mssql');
const readline = require('readline');

module.exports = async function ensureSchema(authConfig) {
  try {
    const pool = await sql.connect(authConfig);

    const checks = [
      { column: 'email', query: "ALTER TABLE cohauth.dbo.user_account ADD email VARCHAR(254) NULL;" },
      { column: 'role', query: "ALTER TABLE cohauth.dbo.user_account ADD role VARCHAR(16) NOT NULL DEFAULT 'user';" },
      { column: 'tracker', query: "ALTER TABLE cohauth.dbo.user_account ADD tracker VARCHAR(1) NOT NULL DEFAULT '1';" },
      { column: 'reset_token', query: "ALTER TABLE cohauth.dbo.user_account ADD reset_token VARCHAR(128) NULL;" },
      { column: 'reset_expires', query: "ALTER TABLE cohauth.dbo.user_account ADD reset_expires BIGINT NULL;" },
      { column: 'register_token', query: "ALTER TABLE cohauth.dbo.user_account ADD register_token VARCHAR(128) NULL;" }
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
  } catch (err) {
    console.error("[ERROR] Failed to ensure schema:", err);
  }
};
