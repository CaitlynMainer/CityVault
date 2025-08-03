const sql = require('mssql');
const { getGamePool, getChatPool, getAuthPool } = require(global.BASE_DIR + '/db');
const { extractGlobalName } = require(global.BASE_DIR + '/utils/characterInfo/extractGlobalName');
const config = require(global.BASE_DIR + '/utils/config');
const { enrichCharacterSummary } = require(global.BASE_DIR + '/utils/characterInfo/enrichCharacterSummary');
const { stringClean } = require(global.BASE_DIR + '/utils/textSanitizer');

function logTime(label, start) {
  const duration = Date.now() - start;
  //console.log(`[TIMER] ${label}: ${duration}ms`);
}

async function showSupergroup(req, res) {
  const startOverall = Date.now();
  const [serverKey, sgidStr] = (req.params.id || '').split(':');
  const sgid = parseInt(sgidStr);

  if (!serverKey || isNaN(sgid) || !config.servers[serverKey]) {
    return res.status(400).send('Invalid supergroup ID or server.');
  }

  try {
    const startPool = Date.now();
    const pool = await getGamePool(serverKey);
    const authPool = await getAuthPool();
    logTime('DB Pools ready', startPool);

    const result = await pool.request()
      .input('id', sql.Int, sgid)
      .query(`
        SELECT Name, Motto, Description, DateCreated, Prestige, UpkeepRentDue
        FROM dbo.Supergroups
        WHERE ContainerId = @id
      `);
    logTime('Supergroup query', startPool);

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
    logTime('Supergroup members query', startPool);

    let rawMembers = membersResult.recordset.filter(row => row?.ContainerId && row?.Rank !== 6);

    // ✅ Collect unique AuthIds
    const authIds = [...new Set(rawMembers.map(m => m.AuthId).filter(Boolean))];

    // ✅ Batch query: tracker flags
    const startAnonymize = Date.now();
    let trackedMap = {};
    if (authIds.length > 0) {
      const trackerQuery = await authPool.request().query(`
        SELECT uid, tracker FROM dbo.user_account
        WHERE uid IN (${authIds.join(',')})
      `);
      for (const row of trackerQuery.recordset) {
        trackedMap[row.uid] = row.tracker === '1';
      }
    }

    // ✅ Anonymize based on batch
    for (const m of rawMembers) {
      m.anonymized = false;
      const tracked = m.AuthId != null && trackedMap[m.AuthId];
      if (!tracked) {
        m.Name = 'Private Character';
        m.globalHandle = 'Private';
        m.AuthId = null;
        m.anonymized = true;
      } else {
        m.globalHandle = 'Unknown'; // Will fill later
      }
    }
    logTime('Anonymization loop (batched)', startAnonymize);

    // ✅ Sort and enrich
    const startEnrich = Date.now();
    let members = rawMembers
      .filter(row => row?.Name)
      .sort((a, b) => {
        const rankA = a.Rank ?? -1;
        const rankB = b.Rank ?? -1;
        if (rankA !== rankB) return rankB - rankA;

        const dateA = a.LastActive ? new Date(a.LastActive) : new Date(0);
        const dateB = b.LastActive ? new Date(b.LastActive) : new Date(0);
        return dateA - dateB;
      });

    members = await Promise.all(
      members.map(async m => {
        const enriched = await enrichCharacterSummary(m, serverKey);
        enriched.RankName = m.CustomRankName || 'Member';
        enriched.globalHandle = m.globalHandle; // preserve for now
        return enriched;
      })
    );
    logTime('Enriching character summaries', startEnrich);

    // ✅ Batch global handle lookup
    const startGlobalLookup = Date.now();
    const chatPool = await getChatPool();

    const globalMap = {};
    if (authIds.length > 0) {
      const chatResult = await chatPool.request().query(`
        SELECT user_id, data FROM dbo.users
        WHERE user_id IN (${authIds.join(',')})
      `);

      for (const row of chatResult.recordset) {
        globalMap[row.user_id] = extractGlobalName(row.data) || 'Unknown';
      }
    }

    for (const m of members) {
      if (!m.anonymized && m.AuthId != null) {
        m.globalHandle = globalMap[m.AuthId] || 'Unknown';
      }
    }
    logTime('Global handle extraction (batched)', startGlobalLookup);

    // ✅ Render
    res.render('supergroup', {
      title: sg.Name,
      serverKey,
      supergroup: {
        ...sg,
        DateCreated: sg.DateCreated?.toISOString().split('T')[0] || 'Unknown'
      },
      members,
      stringClean
    });
    logTime('TOTAL supergroup render time', startOverall);

  } catch (err) {
    console.error('[Supergroup] Error:', err);
    res.status(500).send('Error loading supergroup.');
  }
}

module.exports = { showSupergroup };
