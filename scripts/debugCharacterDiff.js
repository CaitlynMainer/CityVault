global.BASE_DIR = __dirname.replace(/\\scripts$/, ''); // Or hardcode if you want
const sql = require('mssql');
const { getGamePool } = require('../db');

const sourceId = 25098;
const importedId = 25646;
const serverKey = 'victory';

const fs = require('fs');
const path = require('path');

const outputLines = [];
const outputFilePath = path.join(__dirname, 'diff-report.txt');

const tablesToDump = [
  'AccountInventory', 'Appearance', 'ArenaEvents', 'ArenaPlayers', 'AttackerParticipants',
  'AttribMods', 'AutoCommands', 'BadgeMonitor', 'Badges', 'Badges01', 'Badges02',
  'Base', 'BaseRaids', 'Boosts', 'CertificationHistory', 'ChatChannels', 'ChatTabs',
  'ChatWindows', 'CombatMonitorStat', 'CompletedOrders', 'Contacts', 'Costumes', 'CostumeParts',
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

function getHexDiff(bufA, bufB) {
  const len = Math.max(bufA.length, bufB.length);
  const lines = [];

  for (let i = 0; i < len; i++) {
    const a = bufA[i];
    const b = bufB[i];
    if (a !== b) {
      lines.push(`Byte ${i}: 0x${(a ?? '??').toString(16).padStart(2, '0')} !== 0x${(b ?? '??').toString(16).padStart(2, '0')}`);
    }
  }

  return lines.length ? lines.join('\n') : 'Identical';
}

async function runComparison() {
  const pool = await getGamePool(serverKey);

  for (const table of tablesToDump) {
    try {
      const result = await pool.request()
        .input('sourceId', sql.Int, sourceId)
        .input('importedId', sql.Int, importedId)
        .query(`
          SELECT * FROM dbo.${table}
          WHERE ContainerId = @sourceId OR ContainerId = @importedId
          ORDER BY ContainerId
        `);

      const rows = result.recordset;
      const sourceRows = rows.filter(r => r.ContainerId === sourceId);
      const importedRows = rows.filter(r => r.ContainerId === importedId);

      if (sourceRows.length === 0 && importedRows.length === 0) continue;

      if (sourceRows.length !== importedRows.length) {
        outputLines.push(`⚠️  Table ${table}: Row count mismatch (source: ${sourceRows.length}, imported: ${importedRows.length})`);
      }

      const maxRows = Math.max(sourceRows.length, importedRows.length);

      for (let i = 0; i < maxRows; i++) {
        const src = sourceRows[i];
        const imp = importedRows[i];

        if (!src || !imp) {
          outputLines.push(`❌ Table ${table}, row ${i}: Missing ${!src ? 'source' : 'imported'} row`);
          continue;
        }

        const diffs = {};

for (const key of Object.keys(src)) {
  if (key === 'ContainerId') continue;

  const srcVal = src[key];
  const impVal = imp[key];

if (srcVal instanceof Uint8Array && impVal instanceof Uint8Array && srcVal.length > 0 && impVal.length > 0) {
    if (!srcVal.equals(impVal)) {
      diffs[key] = {
        hexDiff: getHexDiff(srcVal, impVal)
      };
    }
  } else if (srcVal instanceof Date && impVal instanceof Date) {
    if (srcVal.getTime() !== impVal.getTime()) {
      diffs[key] = {
        source: srcVal.toISOString(),
        imported: impVal.toISOString()
      };
    }
  } else if (srcVal !== impVal) {
    diffs[key] = {
      source: JSON.stringify(srcVal),
      imported: JSON.stringify(impVal)
    };
  }
}


        if (Object.keys(diffs).length > 0) {
          outputLines.push(`❗ Table ${table}, row ${i}: Differences found`);
          for (const [field, diffData] of Object.entries(diffs)) {
            outputLines.push(`    ${field}:`);
            if (typeof diffData === 'string') {
              outputLines.push(`      ${diffData}`);
            } else {
              for (const [label, value] of Object.entries(diffData)) {
                outputLines.push(`      ${label}: ${value}`);
              }
            }
          }
        }
      }
    } catch (err) {
      if (err.message.includes('Invalid object name')) {
        console.warn(`⚠️  Skipping table ${table}: ${err.message}`);
      } else {
        console.error(`💥 Error checking table ${table}:`, err.message);
      }
    }
  }

  outputLines.push('\n✅ Done comparing characters.');
}

(async () => {
  await runComparison();
  fs.writeFileSync(outputFilePath, outputLines.join('\n'), 'utf8');
  console.log(`✅ Diff report written to ${outputFilePath}`);
})();
