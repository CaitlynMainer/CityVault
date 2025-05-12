const { getGamePool, getAuthPool } = require(global.BASE_DIR + '/db');
const { enrichCharacterSummary } = require(global.BASE_DIR + '/utils/characterInfo/enrichCharacterSummary');
const config = require(global.BASE_DIR + '/data/config.json');
const { stringClean } = require(global.BASE_DIR + '/utils/textSanitizer');
const sql = require('mssql');

async function showPublicProfile(req, res) {
  const authId = parseInt(req.params.authId);
  if (isNaN(authId)) return res.status(400).send('Invalid auth ID');

  let username;
  let forcedAccess = false;

  try {
    const viewerUsername = req.session?.username;
    let isAdmin = false;

    if (viewerUsername) {
      const authPool = await getAuthPool();
      const viewerCheck = await authPool.request()
        .input('viewer', sql.VarChar, viewerUsername)
        .query(`SELECT role FROM dbo.user_account WHERE account = @viewer`);
      isAdmin = viewerCheck.recordset[0]?.role === 'admin';
    }

    const authPool = await getAuthPool();
    const result = await authPool.request()
      .input('uid', sql.Int, authId)
      .query(`SELECT account, tracker FROM dbo.user_account WHERE uid = @uid`);

    const user = result.recordset[0];
    if (!user) return res.status(404).send('User not found');

    username = user.account;

    if (user.tracker !== '1' && !isAdmin) {
      return res.render('public_profile', {
        title: 'Private Profile',
        message: "This user doesn't share their characters.",
        charactersByServer: {},
        username,
        servers: config.servers,
        errors: []
      });
    } else if (user.tracker !== '1') {
      forcedAccess = true;
    }
  } catch (err) {
    console.error('[PublicProfile] Auth check failed:', err);
    return res.status(500).send('Error loading public profile');
  }

  const charactersByServer = {};

  try {
    for (const serverKey of Object.keys(config.servers)) {
      const pool = await getGamePool(serverKey);
      const result = await pool.request()
        .input('authId', sql.Int, authId)
        .query(`
          SELECT e.ContainerId, e.Name, e.Level, e.Class, e.Origin, e.DateCreated, e.LastActive,
                 e.PlayerType, en2.PlayerSubType, en2.PraetorianProgress, en2.originalPrimary, en2.originalSecondary,
                 e.TitleCommon, e.TitleOrigin, e.TitleSpecial, en2.TitleTheText
          FROM dbo.Ents e
          JOIN dbo.Ents2 en2 ON e.ContainerId = en2.ContainerId
          WHERE e.AuthId = @authId
        `);

      const enriched = result.recordset.map(enrichCharacterSummary);
      if (enriched.length) {
        charactersByServer[serverKey] = enriched;
      }
    }

    res.render('public_profile', {
      title: `Public Profile: ${username}`,
      charactersByServer,
      username,
      servers: config.servers,
      message: forcedAccess ? "This is a private profile. Displaying because you are an admin." : null,
      stringClean
    });
  } catch (err) {
    console.error('[PublicProfile] Character query failed:', err);
    res.status(500).send('Server error loading public profile');
  }
}

module.exports = { showPublicProfile };
