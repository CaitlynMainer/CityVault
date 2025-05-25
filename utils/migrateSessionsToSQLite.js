const fs = require('fs');
const path = require('path');
const sqlite3 = require('better-sqlite3');

module.exports = function migrateSessionsToSQLite(sessionDir, sqlitePath) {
    if (!fs.existsSync(sessionDir)) return;

    const files = fs.readdirSync(sessionDir).filter(f => f.endsWith('.json'));
    if (files.length === 0) return;

    console.log(`[SessionMigration] Found ${files.length} sessions to migrate...`);

    const db = sqlite3(sqlitePath);
    db.pragma('journal_mode = WAL');

    db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
            sid TEXT PRIMARY KEY,
            sess TEXT NOT NULL,
            expired INTEGER
        );
    `);

    const insert = db.prepare(`
        REPLACE INTO sessions (sid, sess, expired) VALUES (?, ?, ?)
    `);


  for (const file of files) {
    const fullPath = path.join(sessionDir, file);
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const sess = JSON.parse(content);
      const sid = file.replace(/\.json$/, '');

      const expire = sess.cookie?.expires
        ? new Date(sess.cookie.expires).getTime()
        : Date.now() + (24 * 60 * 60 * 1000);

      insert.run(sid, JSON.stringify(sess), expire);
    } catch (err) {
      console.warn(`[SessionMigration] Failed: ${file} - ${err.message}`);
    }
  }

  console.log(`[SessionMigration] Migration complete.`);

    for (const file of files) {
    const fullPath = path.join(sessionDir, file);
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const sess = JSON.parse(content);
      const sid = file.replace(/\.json$/, '');

      const expired = sess.cookie?.expires
        ? new Date(sess.cookie.expires).getTime()
        : Date.now() + (24 * 60 * 60 * 1000);

      insert.run(sid, JSON.stringify(sess), expired);

      // Remove migrated file
      fs.unlinkSync(fullPath);
    } catch (err) {
      console.warn(`[SessionMigration] Failed: ${file} - ${err.message}`);
    }
  }

  // Attempt to remove the sessions directory if empty
  try {
    const remaining = fs.readdirSync(sessionDir);
    if (remaining.length === 0) {
      fs.rmdirSync(sessionDir);
      console.log(`[SessionMigration] Cleaned up empty sessions directory.`);
    }
  } catch (cleanupErr) {
    console.warn(`[SessionMigration] Cleanup warning: ${cleanupErr.message}`);
  }

  console.log(`[SessionMigration] Migration complete.`);

};
