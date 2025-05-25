const session = require('express-session');
const BetterSqlite3 = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const SESSION_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY,
  sess TEXT NOT NULL,
  expired INTEGER NOT NULL
);
`;

class BetterSessionStore extends session.Store {
  constructor(dbFilePath, options = {}) {
    super();
    this.ttl = options.ttl || 86400;
    const dbDir = path.dirname(dbFilePath);
    fs.mkdirSync(dbDir, { recursive: true });
    this.db = new BetterSqlite3(dbFilePath);
    this.db.prepare(SESSION_TABLE_SQL).run();

    this.cleanupInterval = setInterval(() => {
      this.db.prepare(`DELETE FROM sessions WHERE expired < ?`).run(Date.now());
    }, 3600000);
  }

  get(sid, callback) {
    try {
      const row = this.db.prepare(`SELECT sess FROM sessions WHERE sid = ? AND expired > ?`).get(sid, Date.now());
      if (!row) return callback(null, null);
      callback(null, JSON.parse(row.sess));
    } catch (err) {
      callback(err);
    }
  }

  set(sid, sessionData, callback) {
    try {
      const expires = sessionData?.cookie?.expires
        ? new Date(sessionData.cookie.expires).getTime()
        : Date.now() + this.ttl * 1000;

      const sessStr = JSON.stringify(sessionData);
      this.db.prepare(`REPLACE INTO sessions (sid, sess, expired) VALUES (?, ?, ?)`)
        .run(sid, sessStr, expires);
      callback?.();
    } catch (err) {
      callback?.(err);
    }
  }

  destroy(sid, callback) {
    try {
      this.db.prepare(`DELETE FROM sessions WHERE sid = ?`).run(sid);
      callback?.();
    } catch (err) {
      callback?.(err);
    }
  }

  close() {
    clearInterval(this.cleanupInterval);
    this.db.close();
  }

  touch(sid, session, callback) {
    try {
        const expires = session?.cookie?.expires
        ? new Date(session.cookie.expires).getTime()
        : Date.now() + this.ttl * 1000;

        this.db.prepare(`UPDATE sessions SET expired = ? WHERE sid = ?`).run(expires, sid);
        callback?.();
    } catch (err) {
        callback?.(err);
    }
  }

}

module.exports = BetterSessionStore;
