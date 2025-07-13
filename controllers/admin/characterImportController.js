const sql = require('mssql');
const axios = require('axios');
const FormData = require('form-data');
const { getAuthPool } = require(global.BASE_DIR + '/db');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

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

async function handleImportSubmit(req, res) {
  const session = req.session;
  const zipFile = req.file;
  const { serverKey, targetAccount } = req.body;

  if (!session?.username) return res.redirect('/login');
  if (!['admin', 'gm'].includes(session.role)) return res.status(403).send('Forbidden');

  if (!serverKey || !targetAccount) {
    req.flash('error', 'Server key and account are required.');
    return res.redirect('/admin/character-import');
  }

  if (!zipFile) {
    req.flash('error', 'ZIP file is missing.');
    return res.redirect('/admin/character-import');
  }

  try {
    const form = new FormData();
    form.append('targetAccount', targetAccount);
    form.append('viewerUsername', session.username);
    form.append('importZip', zipFile.buffer, {
      filename: zipFile.originalname,
      contentType: zipFile.mimetype
    });

    const apiUrl = `${req.protocol}://${req.get('host')}/api/character/import/${serverKey}`;
    //console.log('[DEBUG] Posting to API URL:', apiUrl);

    const response = await axios.post(apiUrl, form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity
    });

    req.flash('success', response.data.message || `Imported character as ContainerId ${response.data.newContainerId}`);
  } catch (err) {
    console.error('[Import Submit Error]', err.response?.data || err.message);
    req.flash('error', 'Import failed. Check console for details.');
  }

  res.redirect('/admin/character-import');
}


module.exports = {
  showImportForm,
  handleImportSubmit
};
