const fs = require('fs-extra');
const path = require('path');
const sql = require('mssql');
const archiver = require('archiver');
const { getGamePool, getAuthPool } = require(global.BASE_DIR + '/db');
const crypto = require('crypto');

const alwaysExport = ['CostumeParts'];
const conditionalExport = ['Costumes'];

const staticTables = [
  'AccountInventory', 'Appearance', 'BadgeMonitor', 'Badges', 'Badges01', 'Badges02',
  'Boosts', 'CertificationHistory', 'ChatChannels', 'ChatTabs',
  'ChatWindows', 'CombatMonitorStat', 'CompletedOrders', 'Contacts',
  'DefeatRecord', 'Email', 'Ents', 'Ents2', 'EventHistory',
  'FameStrings', 'Friends', 'GmailClaims', 'GmailPending', 'Ignore', 'Inspirations',
  'InvRecipe0', 'InvRecipeInvention', 'InvSalvage0', 'InvStoredSalvage0',
  'KeyBinds', 'LevelingPacts', 'MapDataTokens',
  'MapGroups', 'MapHistory', 'NewspaperHistory', 'Offline', 'PendingOrders', 'PetNames',
  'PowerCustomizations', 'Powers', 'QueuedRewardTables', 'RecentBadge', 'Recipes',
  'Recipients', 'RewardTokens', 'RewardTokensActive', 'Seating',
  'ShardAccounts', 'SouvenirClues', 'SpecialDetails', 'Stats',
  'StoryArcs', 'Tasks', 'Tray', 'Windows'
];

async function exportCharacterToDisk(serverKey, containerId, characterName, outputDir) {
  const gamePool = await getGamePool(serverKey);
  const allTables = [...staticTables, ...alwaysExport];

  for (const table of conditionalExport) {
    const check = await gamePool.request().query(`
      SELECT COUNT(*) AS existsCheck FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_NAME = '${table}'
    `);
    if (check.recordset[0]?.existsCheck > 0) allTables.push(table);
  }

  for (const table of allTables) {
    try {
      const result = await gamePool.request()
        .input('id', sql.Int, containerId)
        .query(`SELECT * FROM dbo.[${table}] WHERE ContainerId = @id`);

      const rows = result.recordset;
      if (!rows.length) continue;

      const safeName = characterName
        .replace(/\0/g, '')
        .replace(/[<>:"/\\|?*]/g, '')
        .trim();
      const charFolder = path.join(outputDir, safeName);
      await fs.ensureDir(charFolder);

      for (let i = 0; i < rows.length; i++) {
        const filePath = path.join(charFolder, `${table}_${i}.json`);
        await fs.writeJson(filePath, rows[i], { spaces: 2 });
      }
    } catch (err) {
      console.warn(`[Export] Skipped ${table} for ${characterName}: ${err.message}`);
    }
  }
}

async function exportAllCharacters(serverKey, targetAccount, isAdmin, taskId) {
  try {
    const authPool = await getAuthPool();
    const gamePool = await getGamePool(serverKey);

    const userResult = await authPool.request()
      .input('account', sql.VarChar, targetAccount)
      .query(`SELECT uid FROM dbo.user_account WHERE account = @account`);
    const user = userResult.recordset[0];
    if (!user) throw new Error('Target account not found');

    const authId = user.uid;

    const charResult = await gamePool.request()
      .input('authId', sql.Int, authId)
      .query(`
        SELECT e.ContainerId, e.Name
        FROM dbo.Ents e
        WHERE e.AuthId = @authId
          AND EXISTS (
            SELECT 1 FROM dbo.Ents2 e2 WHERE e2.ContainerId = e.ContainerId
          )
      `);

    const characters = charResult.recordset;
    const task = global.characterExportTasks.get(taskId);
    if (task) {
      task.total = characters.length;
      task.completed = 0;
    }

    if (!characters.length) {
      global.characterExportTasks.set(taskId, {
        status: 'error',
        message: 'No characters found.',
        total: 0,
        completed: 0,
        path: null
      });
      return;
    }

    const stagingDir = path.join(global.exportTmpDir, `task_${taskId}`);
    await fs.ensureDir(stagingDir);

    for (const char of characters) {
      await exportCharacterToDisk(serverKey, char.ContainerId, char.Name, stagingDir);
      const task = global.characterExportTasks.get(taskId);
      if (task) task.completed++;
    }

    const zipName = `Export-${targetAccount}-${serverKey}.zip`;
    const publicExportDir = path.join(global.BASE_DIR, 'public', 'exports');
    await fs.ensureDir(publicExportDir);

    const zipPath = path.join(publicExportDir, zipName);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.pipe(output);
    archive.directory(stagingDir, false);
    await archive.finalize();

    const taskDone = global.characterExportTasks.get(taskId);
    if (taskDone) {
      taskDone.status = 'done';
      taskDone.message = `Exported ${characters.length} characters.`;
      taskDone.path = `/exports/${zipName}`;
    }

  } catch (err) {
    console.error('[ExportAll Error]', err);
    global.characterExportTasks.set(taskId, {
      status: 'error',
      message: err.message,
      total: 0,
      completed: 0,
      path: null
    });
  }
}

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

    for (const table of conditionalExport) {
      try {
        const result = await gamePool.request().query(`
          SELECT COUNT(*) AS existsCheck FROM INFORMATION_SCHEMA.TABLES
          WHERE TABLE_NAME = '${table}'
        `);
        if (result.recordset[0]?.existsCheck > 0) {
          tablesToDump.push(table);
        }
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

async function queueCharacterExport(req, res) {
  const { serverKey, containerId, targetAccount } = req.body;
  const viewer = req.session?.username;
  const viewerRole = req.session?.role;

  if (!viewer) return res.status(401).json({ status: 'unauthorized' });
  if (!serverKey) return res.status(400).json({ status: 'error', message: 'Missing serverKey' });
  if (!containerId && !targetAccount) {
    return res.status(400).json({ status: 'error', message: 'Must specify containerId or targetAccount' });
  }

  const isAdmin = ['admin', 'gm'].includes(viewerRole);
  const exportAccount = targetAccount || viewer;
  const taskId = crypto.randomUUID();

  global.characterExportTasks.set(taskId, {
    status: 'in_progress',
    message: null,
    path: null,
    total: 0,
    completed: 0
  });

  const stagingDir = path.join(global.exportTmpDir, `task_${taskId}`);
  fs.ensureDirSync(stagingDir);

  setImmediate(async () => {
    try {
      if (containerId) {
        const gamePool = await getGamePool(serverKey);
        const charQuery = await gamePool.request()
          .input('id', sql.Int, containerId)
          .query(`SELECT Name FROM dbo.Ents WHERE ContainerId = @id`);

        const character = charQuery.recordset[0];
        if (!character) throw new Error('Character not found');

        const characterName = character.Name;
        await exportCharacterToDisk(serverKey, parseInt(containerId), characterName, stagingDir);

        const zipName = `Export-${characterName}-${serverKey}.zip`;
        const publicExportDir = path.join(global.BASE_DIR, 'public', 'exports');
        await fs.ensureDir(publicExportDir);

        const zipPath = path.join(publicExportDir, zipName);
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        archive.pipe(output);
        archive.directory(stagingDir, false);
        await archive.finalize();

        const task = global.characterExportTasks.get(taskId);
        if (task) {
          task.status = 'done';
          task.message = `Exported ${characterName}.`;
          task.path = `/exports/${zipName}`;
        }
      } else {
        await exportAllCharacters(serverKey, exportAccount, isAdmin, taskId);
      }
    } catch (err) {
      console.error('[Export Task Error]', err);
      global.characterExportTasks.set(taskId, {
        status: 'error',
        message: err.message,
        total: 0,
        completed: 0,
        path: null
      });
    }
  });

  return res.json({ status: 'queued', taskId });
}

function checkExportStatus(req, res) {
  const { taskId } = req.params;
  const task = global.characterExportTasks.get(taskId);

  if (!task) {
    return res.status(404).json({ status: 'not_found', message: 'Task not found' });
  }

  res.json(task);
}

module.exports = {
  exportCharacter,
  exportCharacterToDisk,
  exportAllCharacters,
  queueCharacterExport,
  checkExportStatus
};
