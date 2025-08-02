const sql = require('mssql');
const { getAuthPool } = require(global.BASE_DIR + '/db');
const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');

function loadServerList() {
  const config = require(global.BASE_DIR + '/data/config.json');
  return Object.entries(config.servers || {}).map(([key, server]) => ({
    key,
    label: server.label || key
  }));
}

async function showExportForm(req, res) {
  if (!req.session?.username) return res.redirect('/login');

  const servers = loadServerList();
  res.render('account/character-export', {
    title: 'Export Characters',
    servers,
    message: req.flash('success'),
    error: req.flash('error')
  });
}

function showExportStatusPage(req, res) {
  const { taskId } = req.params;
  if (!global.characterExportTasks.has(taskId)) {
    return res.status(404).render('error', {
      title: 'Export Not Found',
      message: 'No export task exists for that ID.'
    });
  }

  res.render('account/character-export-status', { taskId });
}

async function handleExportSubmit(req, res) {
  const { serverKey } = req.body;
  const viewer = req.session?.username;
  const role = req.session?.role;

  if (!viewer || !serverKey) return res.redirect('/login');

  const taskId = crypto.randomUUID();
  global.characterExportTasks.set(taskId, {
    status: 'in_progress',
    message: null,
    path: null
  });

  const { exportAllCharacters } = require(global.BASE_DIR + '/controllers/api/characterExportController');
  exportAllCharacters(serverKey, viewer, ['admin', 'gm'].includes(role), taskId);

  res.redirect(`/account/character-export/status/${taskId}`);
}

async function startSingleExport(req, res) {
  const { serverKey, containerId } = req.params;
  const viewer = req.session?.username;
  const role = req.session?.role;

  if (!viewer) return res.redirect('/login');

  const taskId = crypto.randomUUID();
  global.characterExportTasks.set(taskId, {
    status: 'in_progress',
    message: null,
    path: null
  });

  const { exportCharacterToDisk } = require(global.BASE_DIR + '/controllers/api/characterExportController');

  const stagingDir = path.join(global.exportTmpDir, `task_${taskId}`);
  fs.ensureDirSync(stagingDir);

  setImmediate(async () => {
    try {
      const gamePool = await require(global.BASE_DIR + '/db').getGamePool(serverKey);
	  if (!gamePool) return res.status(400).send('Invalid server.');
      const result = await gamePool.request()
        .input('id', sql.Int, containerId)
        .query(`SELECT Name FROM dbo.Ents WHERE ContainerId = @id`);
      const name = result.recordset[0]?.Name || `Character_${containerId}`;

      await exportCharacterToDisk(serverKey, parseInt(containerId), name, stagingDir);

      const zipName = `Export-${name}-${serverKey}.zip`;
      const zipPath = path.join(global.exportTmpDir, zipName);
      const output = fs.createWriteStream(zipPath);
      const archive = require('archiver')('zip', { zlib: { level: 9 } });

      archive.pipe(output);
      archive.directory(stagingDir, false);
      await archive.finalize();

      global.characterExportTasks.set(taskId, {
        status: 'done',
        message: `Exported ${name}.`,
        path: `/tmp/exports/${zipName}`
      });
    } catch (err) {
      global.characterExportTasks.set(taskId, {
        status: 'error',
        message: err.message
      });
    }
  });

  res.redirect(`/account/character-export/status/${taskId}`);
}

module.exports = {
  showExportForm,
  handleExportSubmit,
  startSingleExport,
  showExportStatusPage
};
