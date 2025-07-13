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

async function importCharacter(req, res) {
  console.log('[IMPORT DEBUG] Active character import handler triggered.');
  fs.writeFileSync(logPath, '');

  const { serverKey } = req.params;
  const viewerUsername = req.body.viewerUsername;
  const targetAccount = req.body.targetAccount;
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

    const inserted = {};
    const importedNames = [];
    const prefixToContainerId = new Map();

    for (const entry of entries) {
      if (entry.isDirectory) continue;

      const match = entry.entryName.match(/(?:([^/\\]+)\/)?([A-Za-z0-9_]+)_(\d+)\.json$/);
      if (!match) continue;

      const [ , prefixRaw, table, index ] = match;
      const prefix = prefixRaw || 'default';

      if (table === 'Costumes' && !hasCostumes) continue;
      if (table === 'CostumeParts' && !hasCostumeParts) continue;

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

      if (
        typeof rowData.SGColorMap === 'string' &&
        /^[0-9a-fA-F]+$/.test(rowData.SGColorMap)
      ) {
        try {
          rowData.SGColorMap = Buffer.from(rowData.SGColorMap, 'hex');
        } catch (err) {
          console.warn(`[DEBUG] Failed to convert SGColorMap in ${entry.entryName}`);
        }
      }

      const baseNameRaw = rowData.Name || `Imported${Date.now()}`;
      const maxLength = 20;
      let suffix = 1;
      let tryName = baseNameRaw;

      while (true) {
        const suffixStr = suffix === 1 ? '' : String(suffix);
        const truncatedBase = baseNameRaw.slice(0, maxLength - suffixStr.length);
        tryName = truncatedBase + suffixStr;

        const check = await gamePool.request()
          .input('name', sql.VarChar, tryName)
          .query(`SELECT COUNT(*) AS count FROM dbo.Ents WHERE Name = @name`);

        if (check.recordset[0].count === 0) break;
        suffix++;
      }

      rowData.Name = tryName;

      // For all rows, assign ContainerId/Auth
      const containerId = prefixToContainerId.get(prefix);
      if ('ContainerId' in rowData) rowData.ContainerId = containerId;
      if ('AuthId' in rowData) rowData.AuthId = newAuthId;
      if ('AuthName' in rowData) rowData.AuthName = newAuthName;

      let columns = Object.keys(rowData);
      let values = Object.values(rowData);

      const skipInsertContainerId = table === 'Ents';
      if (skipInsertContainerId) {
        const idx = columns.indexOf('ContainerId');
        if (idx !== -1) {
          columns.splice(idx, 1);
          values.splice(idx, 1);
        }
      }

      const placeholders = columns.map((_, i) => `@val${i}`).join(', ');
      const columnList = columns.map(col => `[${col}]`).join(', ');
      const sqlQuery = `INSERT INTO dbo.[${table}] (${columnList}) VALUES (${placeholders})`;

      const inlineSql = `INSERT INTO dbo.[${table}] (${columnList}) VALUES (${values.map(v =>
        v === null ? 'NULL' :
          typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` :
            Buffer.isBuffer(v) ? `'${v.toString('hex')}'` : v
      ).join(', ')})`;

      const request = gamePool.request();
      columns.forEach((col, i) => {
        const value = values[i];
        if (col === 'SGColorMap') {
          request.input(`val${i}`, sql.VarBinary, value);
        } else if (value === null || value === undefined) {
          request.input(`val${i}`, null);
        } else if (Buffer.isBuffer(value)) {
          request.input(`val${i}`, sql.VarBinary, value);
        } else {
          request.input(`val${i}`, value);
        }
      });

      try {
        logToFile(`[${table}_${index}] OK`, inlineSql);
        if (table === 'Ents') {
          const result = await request.query(`${sqlQuery}; SELECT SCOPE_IDENTITY() AS newId`);
          const newId =
            (result.recordsets?.[1]?.[0]?.newId) ??
            (result.recordsets?.[0]?.[0]?.newId) ??
            null;
          if (newId) prefixToContainerId.set(prefix, newId);
          nextContainerId = Math.max(nextContainerId, newId + 1);

          if (!inserted.Ents) inserted.Ents = [];
          inserted.Ents.push(rowData.Name);
          importedNames.push(rowData.Name);
        } else {
          await request.query(sqlQuery);
          if (!inserted[table]) inserted[table] = [];
          inserted[table].push(`Row_${index}`);
        }
      } catch (err) {
        logToFile(`[${table}_${index}] ERROR: ${err.message}`, inlineSql);
      }
    }

    const importedCount = importedNames.length;
    return res.send({
      success: true,
      message: `Imported ${importedCount} character${importedCount !== 1 ? 's' : ''} to account ${newAuthName}: ${importedNames.join(', ')}`,
      newContainerId: null, // not meaningful anymore
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
    const reqMock = {
      file: { buffer },
      params: { serverKey },
      body: { viewerUsername, targetAccount }
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
