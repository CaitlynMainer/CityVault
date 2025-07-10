const sql = require('mssql');
const archiver = require('archiver');
const { getGamePool, getAuthPool } = require(global.BASE_DIR + '/db');

const alwaysExport = [
  'CostumeParts'
];

const conditionalExport = [
  'Costumes'
];

const staticTables = [
  'AccountInventory', 'Appearance', 'ArenaEvents', 'ArenaPlayers', 'AttackerParticipants',
  'AttribMods', 'AutoCommands', 'BadgeMonitor', 'Badges', 'Badges01', 'Badges02',
  'Base', 'BaseRaids', 'Boosts', 'CertificationHistory', 'ChatChannels', 'ChatTabs',
  'ChatWindows', 'CombatMonitorStat', 'CompletedOrders', 'Contacts',
  'DefeatRecord', 'DefenderParticipants', 'Email', 'Ents', 'Ents2', 'EventHistory',
  'FameStrings', 'Friends', 'GmailClaims', 'GmailPending', 'Ignore', 'Inspirations',
  'InvBaseDetail', 'InvRecipe0', 'InvRecipeInvention', 'InvSalvage0', 'InvStoredSalvage0',
  'ItemOfPowerGames', 'ItemsOfPower', 'KeyBinds', 'Leagues', 'LevelingPacts', 'MapDataTokens',
  'MapGroups', 'MapHistory', 'MARTYTracks', 'MinedData', 'MiningAccumulator',
  'NewspaperHistory', 'Offline', 'Participants', 'PendingOrders', 'Petitions', 'PetNames',
  'PowerCustomizations', 'Powers', 'QueuedRewardTables', 'RecentBadge', 'Recipes',
  'Recipients', 'RewardTokens', 'RewardTokensActive', 'Seating', 'SGRaidInfos',
  'SgrpBadgeStats', 'SgrpCustomRanks', 'SgrpMembers', 'SgrpPraetBonusIDs',
  'SgrpRewardTokens', 'SGTask', 'ShardAccounts', 'SouvenirClues', 'SpecialDetails', 'Stats',
  'statserver_SupergroupStats', 'StoryArcs', 'SuperCostumeParts', 'SuperGroupAllies',
  'Supergroups', 'TaskForceContacts', 'TaskForceParameters', 'Taskforces',
  'TaskForceSouvenirClues', 'TaskForceStoryArcs', 'TaskForceTasks', 'Tasks',
  'TeamLeaderIds', 'TeamLockStatus', 'TeamupRewardTokensActive', 'Teamups',
  'TeamupTask', 'TestDataBaseTypes', 'Tray', 'VisitedMaps', 'Windows'
];

async function exportCharacter(req, res) {
  const { serverKey, containerId } = req.params;
  const characterName = req.query.charactername || `Character_${containerId}`;
  const dbid = parseInt(containerId);
  const viewerUsername = req.session?.username;

  if (!viewerUsername || !serverKey || isNaN(dbid)) {
    return res.status(400).send('Invalid request.');
  }

  try {
    const gamePool = await getGamePool(serverKey);
    const authPool = await getAuthPool();

    const charResult = await gamePool.request()
      .input('id', sql.Int, dbid)
      .query(`SELECT AuthId FROM dbo.Ents WHERE ContainerId = @id`);
    const character = charResult.recordset[0];
    if (!character) return res.status(404).send('Character not found.');

    const ownerResult = await authPool.request()
      .input('uid', sql.Int, character.AuthId)
      .query(`SELECT account FROM dbo.user_account WHERE uid = @uid`);
    const owner = ownerResult.recordset[0];
    if (!owner) return res.status(404).send('Character owner not found.');

    const viewerResult = await authPool.request()
      .input('viewer', sql.VarChar, viewerUsername)
      .query(`SELECT role FROM dbo.user_account WHERE account = @viewer`);
    const viewerRole = viewerResult.recordset[0]?.role || '';

    const isAdmin = ['admin', 'gm'].includes(viewerRole);
    const isOwner = viewerUsername === owner.account;

    if (!isAdmin && !isOwner) {
      return res.status(403).send('Access denied.');
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${characterName}.zip"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);

    const tablesToDump = [...staticTables, ...alwaysExport];

    // Check if Costumes table exists
    for (const table of conditionalExport) {
      try {
        const result = await gamePool.request().query(`
          SELECT COUNT(*) AS existsCheck FROM INFORMATION_SCHEMA.TABLES
          WHERE TABLE_NAME = '${table}'
        `);
        const exists = result.recordset[0]?.existsCheck > 0;
        if (exists) tablesToDump.push(table);
      } catch (err) {
        console.warn(`[Export] Failed to check existence of ${table}:`, err.message);
      }
    }

    for (const table of tablesToDump) {
      try {
        const result = await gamePool.request()
          .input('id', sql.Int, dbid)
          .query(`SELECT * FROM dbo.[${table}] WHERE ContainerId = @id`);

        const rows = result.recordset;
        if (rows.length > 0) {
          rows.forEach((row, index) => {
            const json = JSON.stringify(row, null, 2);
            archive.append(json, { name: `${characterName}/${table}_${index}.json` });
          });
        }
      } catch (err) {
        console.warn(`[Export] Skipping ${table} due to error:`, err.message);
      }
    }

    archive.finalize();
  } catch (err) {
    console.error('[Export Error]', err);
    return res.status(500).send('Server error during export.');
  }
}

module.exports = {
  exportCharacter
};
