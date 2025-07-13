const sql = require('mssql');
const axios = require('axios');
const FormData = require('form-data');
const { getAuthPool } = require(global.BASE_DIR + '/db');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const path = require('path');
const fs = require('fs-extra');

function loadServerList() {
  const config = require(global.BASE_DIR + '/data/config.json');
  return Object.entries(config.servers || {}).map(([key, server]) => ({
    key,
    label: server.label || key
  }));
}

async function showImportForm(req, res) {
  if (!req.session?.username) return res.redirect('/login');

  const authPool = await getAuthPool();
  const viewerResult = await authPool.request()
    .input('account', sql.VarChar, req.session.username)
    .query(`SELECT role FROM dbo.user_account WHERE account = @account`);

  const role = viewerResult.recordset[0]?.role;
  if (!['admin', 'gm'].includes(role)) return res.status(403).send('Forbidden');

  const result = await authPool.request().query(`SELECT account FROM dbo.user_account ORDER BY account`);
  const accounts = result.recordset.map(r => r.account);
  const servers = loadServerList();

  res.render('admin/character-import', {
    title: 'Import Character',
    accounts,
    servers,
    message: req.flash('success'),
    error: req.flash('error')
  });
}

function generateUUID() {
  return crypto.randomUUID();
}

async function handleImportSubmit(req, res) {
  const session = req.session;
  const zipFile = req.file;
  const { serverKey, targetAccount } = req.body;

  if (!session?.username) return res.redirect('/login');
  if (!['admin', 'gm'].includes(session.role)) return res.status(403).send('Forbidden');

  if (!serverKey || !targetAccount || !zipFile) {
    req.flash('error', 'Missing required fields.');
    return res.redirect('/admin/character-import');
  }

  const taskId = generateUUID();
  const zipPath = path.join(global.importTmpDir, `${taskId}.zip`);

  await fs.writeFile(zipPath, zipFile.buffer);

  global.characterImportTasks.set(taskId, {
    status: 'in_progress',
    message: null,
    error: null
  });

  // Launch background import
  const { importCharacterFromFile } = require(global.BASE_DIR + '/controllers/api/characterImportController');
  importCharacterFromFile({
    zipPath,
    serverKey,
    viewerUsername: session.username,
    targetAccount,
    taskId
  });

  res.redirect(`/admin/character-import/status/${taskId}`);
}

function showImportStatusPage(req, res) {
  const { taskId } = req.params;

  if (!global.characterImportTasks.has(taskId)) {
    return res.status(404).render('error', {
      title: 'Import Not Found',
      message: 'No import task exists for that ID.'
    });
  }

  res.render('admin/character-import-status', { taskId });
}

module.exports = {
  showImportForm,
  handleImportSubmit,
  showImportStatusPage
};
