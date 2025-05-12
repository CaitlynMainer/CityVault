const sql = require('mssql');
const { getGamePool, getChatPool, getAuthPool } = require(global.BASE_DIR + '/db');
const { extractGlobalName } = require(global.BASE_DIR + '/utils/characterInfo/extractGlobalName');
const config = require(global.BASE_DIR + '/data/config.json');
const { enrichCharacterSummary } = require(global.BASE_DIR + '/utils/characterInfo/enrichCharacterSummary');

async function showSupergroup(req, res) {
  const [serverKey, sgidStr] = (req.params.id || '').split(':');
  const sgid = parseInt(sgidStr);

  if (!serverKey || isNaN(sgid) || !config.servers[serverKey]) {
    return res.status(400).send('Invalid supergroup ID or server.');
  }

  try {
    const pool = await getGamePool(serverKey);
    const authPool = await getAuthPool();
    const result = await pool.request()
      .input('id', sql.Int, sgid)
      .query(`
        SELECT Name, Motto, Description, DateCreated, Prestige, UpkeepRentDue
        FROM dbo.Supergroups
        WHERE ContainerId = @id
      `);

    const sg = result.recordset[0];
    if (!sg) return res.status(404).send('Supergroup not found.');

    const membersResult = await pool.request()
      .input('sgid', sql.Int, sgid)
      .query(`
        SELECT SM.Dbid AS ContainerId,
               E.Name,
               E.Level,
               E.Class,
               E.Origin,
               E.LastActive,
               E.AuthId,
               E.PlayerType,
               E2.PlayerSubType,
               E2.PraetorianProgress,
               SM.Rank,
               COALESCE(CR.Name, CR0.Name) AS CustomRankName,
               B.Owned AS OwnedBadges
        FROM dbo.SgrpMembers SM
        LEFT JOIN dbo.SgrpCustomRanks CR ON SM.ContainerId = CR.ContainerId AND SM.Rank = CR.SubId
        LEFT JOIN dbo.SgrpCustomRanks CR0 ON SM.ContainerId = CR0.ContainerId AND COALESCE(SM.Rank, 0) = CR0.SubId
        LEFT JOIN dbo.Ents E ON SM.Dbid = E.ContainerId
        LEFT JOIN dbo.Ents2 E2 ON SM.Dbid = E2.ContainerId
        LEFT JOIN dbo.Badges B ON SM.Dbid = B.ContainerId
        WHERE SM.ContainerId = @sgid
      `);

    const rawMembers = membersResult.recordset.filter(row => row?.ContainerId && row?.Rank !== 6);

    // Check account tracker values and anonymize if needed
    for (const m of rawMembers) {
    m.anonymized = false;

    if (m.AuthId != null) {
        try {
        const trackerResult = await authPool.request()
            .input('uid', sql.Int, m.AuthId)
            .query('SELECT tracker FROM dbo.user_account WHERE uid = @uid');

        const isTracked = trackerResult.recordset[0]?.tracker === '1';

        if (!isTracked) {
            m.Name = 'Private Character';
            m.globalHandle = 'Private';
            m.AuthId = null; // ← prevent linking to profile
            m.anonymized = true;
        }
        } catch (e) {
        m.globalHandle = 'Unknown';
        }
    } else {
        m.globalHandle = 'Unknown';
    }
    }

    const members = membersResult.recordset
    .filter(row =>
        row?.ContainerId &&
        row?.Name &&
        row?.Rank !== 6 // hide GM_Hidden
    )
    .sort((a, b) => {
        // Rank descending (Leader 5 at top, Member null or 0 at bottom)
        const rankA = a.Rank ?? -1;
        const rankB = b.Rank ?? -1;

        if (rankA !== rankB) return rankB - rankA;

        // Then by oldest LastActive
        const dateA = a.LastActive ? new Date(a.LastActive) : new Date(0);
        const dateB = b.LastActive ? new Date(b.LastActive) : new Date(0);
        return dateA - dateB;
    })
    .map(row => {
        const enriched = enrichCharacterSummary(row);
        enriched.RankName = row.CustomRankName || 'Member';
        return enriched;
    });
     const chatPool = await getChatPool();

    for (const m of members) {
    if (!m.anonymized && m.AuthId != null) {
        try {
        const chatResult = await chatPool.request()
            .input('authId', sql.Int, m.AuthId)
            .query('SELECT data FROM dbo.users WHERE user_id = @authId');

        const raw = chatResult.recordset[0]?.data;
        m.globalHandle = extractGlobalName(raw) || 'Unknown';
        } catch (e) {
        m.globalHandle = 'Unknown';
        }
    }
    }

    res.render('supergroup', {
      title: sg.Name,
      serverKey,
      supergroup: {
        ...sg,
        DateCreated: sg.DateCreated?.toISOString().split('T')[0] || 'Unknown'
      },
      members
    });
  } catch (err) {
    console.error('[Supergroup] Error:', err);
    res.status(500).send('Error loading supergroup.');
  }
}

module.exports = { showSupergroup };
