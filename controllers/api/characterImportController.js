const multer = require('multer');
const AdmZip = require('adm-zip');
const sql = require('mssql');
const { getGamePool, getAuthPool } = require(global.BASE_DIR + '/db');
const fs = require('fs-extra');
const path = require('path');

const logPath = path.join(__dirname, '../../logs/character-import.log');

function logToFile(...lines) {
  const out = lines.map(x => (typeof x === 'string' ? x : JSON.stringify(x, null, 2))).join('\n') + '\n\n';
  fs.appendFileSync(logPath, out);
}

const skipTables = new Set([
  // Supergroup
  'Supergroups',
  'SgrpMembers',
  'SgrpCustomRanks',
  'SGRaidInfos',
  'statserver_SupergroupStats',

  // Taskforce
  'Taskforces',
  'TaskForceContacts',
  'TaskForceParameters',
  'TaskForceStoryArcs',
  'TaskForceTasks',

  // Map groups
  'MapGroups',
  'MapDataTokens',

  // Mining
  'MiningAccumulator',
  'MinedData',
]);

const identityTables = new Set([
  'Ents',
  'ArenaEvents',
  'Base',
  'ItemsOfPower',
  'MapGroups',
  'MiningAccumulator',
  'Petitions',
  'SGRaidInfos',
  'statserver_SupergroupStats',
  'Supergroups',
  'Taskforces'
]);


async function importCharacter(req, res) {
  fs.writeFileSync(logPath, '');
  const { serverKey } = req.params;
  const { viewerUsername, targetAccount, taskId } = req.body;
  const zipFile = req.file;

  if (!viewerUsername || !zipFile || !targetAccount) {
    return res.status(400).send('Missing required fields.');
  }

  try {
    const authPool = await getAuthPool();
    const viewerResult = await authPool.request()
      .input('viewer', sql.VarChar, viewerUsername)
      .query(`SELECT role FROM dbo.user_account WHERE account = @viewer`);
    const viewerRole = viewerResult.recordset[0]?.role || '';
    if (!['admin', 'gm'].includes(viewerRole)) {
      return res.status(403).send('Only admins or GMs may import characters.');
    }

    const targetResult = await authPool.request()
      .input('account', sql.VarChar, targetAccount)
      .query(`SELECT uid, account FROM dbo.user_account WHERE account = @account`);
    const target = targetResult.recordset[0];
    if (!target) return res.status(404).send('Target account not found.');

    const newAuthId = target.uid;
    const newAuthName = target.account;

    const gamePool = await getGamePool(serverKey);
	  if (!gamePool) return res.status(400).send('Invalid server.');
    const idResult = await gamePool.request().query(`SELECT MAX(ContainerId) AS maxId FROM dbo.Ents`);
    let nextContainerId = (idResult.recordset[0]?.maxId || 0) + 1;

    const tableCheck = await gamePool.request().query(`
      SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'dbo'
    `);
    const tableSet = new Set(tableCheck.recordset.map(r => r.TABLE_NAME));
    const hasCostumes = tableSet.has('Costumes');
    const hasCostumeParts = tableSet.has('CostumeParts');

    const zip = new AdmZip(zipFile.buffer);
    const entries = zip.getEntries();

    entries.sort((a, b) => {
      const aName = a.entryName.toLowerCase();
      const bName = b.entryName.toLowerCase();
      if (aName.includes('ents_0.json')) return -1;
      if (bName.includes('ents_0.json')) return 1;
      return aName.localeCompare(bName);
    });

    // Determine distinct character prefixes (i.e. folders)
    const characterPrefixes = new Set(
      entries
        .filter(e => !e.isDirectory && /\/?Ents_0\.json$/i.test(e.entryName))
        .map(e => e.entryName.split('/')[0])
    );

    if (taskId && global.characterImportTasks.has(taskId)) {
      const task = global.characterImportTasks.get(taskId);
      task.total = characterPrefixes.size;
      task.completed = 0;
      global.characterImportTasks.set(taskId, task);
    }

    const inserted = {};
    const importedNames = [];
    const prefixToContainerId = new Map();

    const grouped = {};
    for (const entry of entries) {
      if (entry.isDirectory) continue;

      const match = entry.entryName.match(/(?:([^/\\]+)\/)?([A-Za-z0-9_]+)_(\d+)\.json$/);
      if (!match) continue;

      const [ , prefixRaw, table, index ] = match;
      const prefix = prefixRaw || 'default';

      if (table === 'Costumes' && !hasCostumes) continue;
      if (table === 'CostumeParts' && !hasCostumeParts) continue;

      if (!grouped[prefix]) grouped[prefix] = [];
      grouped[prefix].push({ entry, table, index });
    }

    for (const prefix of Object.keys(grouped)) {
      let newEntName = null;
      for (const { entry, table, index } of grouped[prefix]) {
        let rowData;
        try {
          rowData = JSON.parse(entry.getData().toString('utf8'));
        } catch (err) {
          console.warn(`Invalid JSON in ${entry.entryName}`);
          continue;
        }

        for (const [key, val] of Object.entries(rowData)) {
          if (val && typeof val === 'object' && val.type === 'Buffer' && Array.isArray(val.data)) {
            rowData[key] = Buffer.from(val.data);
          }
        }

        if (typeof rowData.SGColorMap === 'string' && /^[0-9a-fA-F]+$/.test(rowData.SGColorMap)) {
          try {
            rowData.SGColorMap = Buffer.from(rowData.SGColorMap, 'hex');
          } catch (err) {
            console.warn(`[DEBUG] Failed to convert SGColorMap in ${entry.entryName}`);
          }
        }

        const isEnts = table === 'Ents';
        if (skipTables.has(table)) {
          logToFile(`[${table}_${index}] SKIPPED: Not importing this table (unsafe or unwanted)`);
          continue;
        }

        if (isEnts) {
          const baseNameRaw = rowData.Name || `Imported${Date.now()}`;
          const maxLength = 20;
          let suffix = 1;
          let tryName;

          while (true) {
            const suffixStr = suffix === 1 ? '' : String(suffix);
            tryName = baseNameRaw.slice(0, maxLength - suffixStr.length) + suffixStr;
            const check = await gamePool.request()
              .input('name', sql.VarChar, tryName)
              .query(`SELECT COUNT(*) AS count FROM dbo.Ents WHERE Name = @name`);
            if (check.recordset[0].count === 0) break;
            suffix++;
          }

          rowData.Name = tryName;
          newEntName = tryName;
        }

        if ('ContainerId' in rowData) rowData.ContainerId = prefixToContainerId.get(prefix);
        if ('AuthId' in rowData) rowData.AuthId = newAuthId;
        if ('AuthName' in rowData) rowData.AuthName = newAuthName;

        // Always skip SUID from Ents
        if (isEnts && 'SUID' in rowData) {
          delete rowData.SUID;
        }

        // Always skip AccessLevel from Ents
        if (isEnts && 'AccessLevel' in rowData) {
          delete rowData.AccessLevel;
        }

        // Always skip SupergroupsId from Ents
        if (isEnts && 'SupergroupsId' in rowData) {
          delete rowData.SupergroupsId;
        }

        // Always skip TeamupsId from Ents
        if (isEnts && 'TeamupsId' in rowData) {
          delete rowData.TeamupsId;
        }

        // Always skip TaskforcesId from Ents
        if (isEnts && 'TaskforcesId' in rowData) {
          delete rowData.TaskforcesId;
        }


        let columns = Object.keys(rowData);
        let values = Object.values(rowData);

        // Filter out columns that don't exist in the destination table
        if (!tableSet.has(table)) {
          logToFile(`[${table}_${index}] Skipped: Table does not exist in database`);
          continue;
        }

        const columnCheck = await gamePool.request()
          .input('table', sql.VarChar, table)
          .query(`
            SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = @table AND TABLE_SCHEMA = 'dbo'
          `);

        const validColumns = new Set(columnCheck.recordset.map(r => r.COLUMN_NAME));

        // Filter rowData to only include valid columns
        columns = columns.filter((col, i) => validColumns.has(col));
        values = columns.map(col => rowData[col]);

        if (identityTables.has(table)) {
          const idx = columns.indexOf('ContainerId');
          if (idx !== -1) {
            columns.splice(idx, 1);
            values.splice(idx, 1);
          }
        }

        const placeholders = columns.map((_, i) => `@val${i}`).join(', ');
        const columnList = columns.map(col => `[${col}]`).join(', ');
        const sqlQuery = `INSERT INTO dbo.[${table}] (${columnList}) VALUES (${placeholders})`;

        const request = gamePool.request();
        columns.forEach((col, i) => {
          const val = values[i];

          if (val === null || val === undefined) {
            request.input(`val${i}`, null);
          } else if (Buffer.isBuffer(val)) {
            request.input(`val${i}`, sql.VarBinary, val);
          } else if (typeof val === 'string') {
            request.input(`val${i}`, sql.VarChar, val);
          } else if (typeof val === 'number') {
            if (Number.isInteger(val)) {
              request.input(`val${i}`, sql.Int, val);
            } else {
              request.input(`val${i}`, sql.Float, val);
            }
          } else if (typeof val === 'boolean') {
            request.input(`val${i}`, sql.Bit, val);
          } else {
            // fallback - let MSSQL infer if possible (not ideal, but safe)
            request.input(`val${i}`, val);
          }
        });

        try {
          if (isEnts) {
            const result = await request.query(`${sqlQuery}; SELECT SCOPE_IDENTITY() AS newId`);
            const newId = result.recordsets?.[1]?.[0]?.newId ?? result.recordsets?.[0]?.[0]?.newId;
            if (newId) {
              prefixToContainerId.set(prefix, newId);
              nextContainerId = Math.max(nextContainerId, newId + 1);
              importedNames.push(newEntName);
              if (!inserted.Ents) inserted.Ents = [];
              inserted.Ents.push(newEntName);
            }
          } else {
            await request.query(sqlQuery);
            if (!inserted[table]) inserted[table] = [];
            inserted[table].push(`Row_${index}`);
          }
        } catch (err) {
          logToFile(`[${table}_${index}] ERROR: ${err.message}`);
        }
      }

      // Only now increment per-character
      if (taskId && global.characterImportTasks.has(taskId)) {
        const task = global.characterImportTasks.get(taskId);
        task.completed++;
        global.characterImportTasks.set(taskId, task);
      }
    }

    const importedCount = importedNames.length;
    return res.send({
      success: true,
      message: `Imported ${importedCount} character${importedCount !== 1 ? 's' : ''} to account ${newAuthName}: ${importedNames.join(', ')}`,
      newContainerId: null,
      targetAccount: newAuthName,
      imported: inserted
    });

  } catch (err) {
    console.error('[Character Import Error]', err);
    return res.status(500).send('Server error during import.');
  }
}

async function importCharacterFromFile({ zipPath, serverKey, viewerUsername, targetAccount, taskId }) {
  try {
    const buffer = await fs.readFile(zipPath);
    global.characterImportTasks.set(taskId, {
      status: 'in_progress',
      message: 'Starting import...',
      completed: 0,
      total: 0
    });

    const reqMock = {
      file: { buffer },
      params: { serverKey },
      body: { viewerUsername, targetAccount, taskId }
    };

    const resMock = {
      send: (data) => {
        global.characterImportTasks.set(taskId, {
          status: 'done',
          message: data.message,
          result: data
        });
      },
      status: function(code) {
        this._status = code;
        return this;
      },
      json: (data) => {
        global.characterImportTasks.set(taskId, {
          status: 'error',
          message: `Failed: ${data}`,
          error: data
        });
      }
    };

    await importCharacter(reqMock, resMock);
  } catch (err) {
    console.error(`[Import Task ${taskId}]`, err);
    global.characterImportTasks.set(taskId, {
      status: 'error',
      message: err.message,
      error: err
    });
  } finally {
    fs.remove(zipPath).catch(() => {});
  }
}

module.exports = {
  importCharacter,
  importCharacterFromFile
};
