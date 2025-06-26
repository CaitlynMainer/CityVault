// characterListController.js
const sql = require('mssql');
const fs = require('fs');
const path = require('path');
const { getGamePool, getAuthPool } = require(global.BASE_DIR + '/db');
const { enrichCharacterSummary } = require(global.BASE_DIR + '/utils/characterInfo/enrichCharacterSummary');
const { stringClean } = require(global.BASE_DIR + '/utils/textSanitizer');
const config = require(global.BASE_DIR + '/utils/config');

async function showCharacterList(req, res) {
  if (!req.session.username) {
    return res.redirect('/login');
  }

  /* 
  // If the user is an admin, look for a ?uid=## override appended to the url.
  // If override exists, use that as the authId when loading the charcer list.
  // Such overrides are rejected if somehow present when the user is not admin.
  */
  const isAdmin = req.session.role === 'admin';
  let   authId  = (isAdmin && req.query.uid) ? parseInt(req.query.uid, 10) : undefined;

  // Sanitize bad input for uid just in case
  if (isNaN(authId)) authId = undefined;

  // If no override or not admin, fallback to standard uid lookup of current user
  if (!authId) {
    try {
      const authPool = await getAuthPool();
      const result = await authPool.request()
        .input('username', sql.VarChar, req.session.username)
        .query(`SELECT uid FROM dbo.user_account WHERE account = @username`);
      authId = result.recordset[0]?.uid;
      if (!authId) throw new Error('User not found');
    } catch (err) {
      console.error('[CharacterList] AuthId lookup failed:', err);
      return res.status(500).send('Unable to look up account ID.');
    }
  }

  const charactersByServer = {};
  const totalsByServer	   = {};

  try {
    for (const serverKey of Object.keys(config.servers)) {
      const pool = await getGamePool(serverKey);

      const result = await pool.request()
        .input('authId', sql.Int, authId)
        .query(`
          SELECT e.ContainerId, e.Name, e.Level, e.Class, e.Origin, e.DateCreated, e.LastActive, e.TotalTime, e.LoginCount, e.CurrentCostume,
                 e.PlayerType, en2.PlayerSubType, en2.PraetorianProgress, en2.originalPrimary, en2.originalSecondary,
                 e.TitleCommon, e.TitleOrigin, e.TitleSpecial, en2.TitleTheText
          FROM dbo.Ents e
          JOIN dbo.Ents2 en2 ON e.ContainerId = en2.ContainerId
          WHERE e.AuthId = @authId
        `);

      const enriched = result.recordset.map(row => {
        const enrichedChar = enrichCharacterSummary(row, serverKey);
        const filename = `${serverKey}_${row.ContainerId}.png`;
        const portraitPath = path.join(global.BASE_DIR, 'public/images/portrait', filename);
        let portraitVersion = 0;
        try {
          const stat = fs.statSync(portraitPath);
          portraitVersion = stat.mtimeMs;
        } catch (_) {}
        return {
          ...enrichedChar,
          serverKey,
          portraitVersion
        };
      });
	  
      // Tally up number of characters, logins, and play time for the shard
      const totalSeconds        = result.recordset.reduce((s, r) => s + (r.TotalTime  || 0), 0);
      const totalLogins         = result.recordset.reduce((s, r) => s + (r.LoginCount || 0), 0);
      const totalHours          = Math.round(totalSeconds / 3600);
      const totalCharacters     = result.recordset.length;
      totalsByServer[serverKey] = { totalHours, totalLogins, totalCharacters };

      if (enriched.length) {
        charactersByServer[serverKey] = enriched;
      }
    }

	res.render('character_list', { charactersByServer, totalsByServer, stringClean });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error loading character list');
  }
}

module.exports = { showCharacterList };
