const sql = require('mssql');
const config = require(global.BASE_DIR + '/utils/config');
const { getGamePool } = require(global.BASE_DIR + '/db');
const { stringClean } = require(global.BASE_DIR + '/utils/textSanitizer');
const mapNameLookup = require(global.BASE_DIR + '/utils/mapNameLookup');

const petitionCategories = {
  1: 'Stuck',
  2: 'Exploits and Cheating',
  3: 'Feedback and Suggestions',
  4: 'Harassment and Conduct',
  5: 'Technical Issues',
  6: 'General Help'
};


exports.list = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = 25;
  const allPetitions = [];

  for (const serverKey of Object.keys(config.servers)) {
    const pool = await getGamePool(serverKey);
    const result = await pool.request().query(`
      SELECT *, '${serverKey}' AS serverKey FROM dbo.Petitions
    `);
    allPetitions.push(...result.recordset);
  }

  // Sort by Date descending
  allPetitions.sort((a, b) => new Date(b.Date) - new Date(a.Date));

  const totalItems = allPetitions.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const startIndex = (page - 1) * pageSize;
  const pageData = allPetitions.slice(startIndex, startIndex + pageSize);

  res.render('admin/petitions/list', {
    petitions: pageData,
    currentPage: page,
    totalPages,
    totalItems
  });
};


exports.view = async (req, res) => {
  const { serverKey, id } = req.params;

  try {
    const pool = await getGamePool(serverKey);
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT *, '${serverKey}' AS serverKey FROM dbo.Petitions WHERE ContainerId = @id`);

    if (result.recordset.length === 0) return res.status(404).send('Petition not found');

    const petition = result.recordset[0];

    petition.CategoryName = petitionCategories[petition.Category] || `Unknown (${petition.Category})`;
    petition.Summary = stringClean(petition.Summary);
    petition.Msg = stringClean(petition.Msg);

    const rawMap = petition.MapName?.toLowerCase() || '';
    const mapData = mapNameLookup[rawMap];

    petition.MapDisplay = mapData?.FriendlyName || petition.MapName;
    petition.MapContainerId = mapData?.ContainerId || null;

    res.render('admin/petitions/view', { petition });
  } catch (err) {
    console.error('Error loading petition:', err);
    res.status(500).send('Internal server error');
  }
};

exports.markFetched = async (req, res) => {
  const { serverKey, id } = req.params;
  try {
    const pool = await getGamePool(serverKey);
    await pool.request()
      .input('id', sql.Int, id)
      .query(`UPDATE dbo.Petitions SET Fetched = 1 WHERE ContainerId = @id`);
    res.redirect(`/admin/petitions/${serverKey}/${id}`);
  } catch (err) {
    console.error('Error marking fetched:', err);
    res.status(500).send('Internal server error');
  }
};

exports.markDone = async (req, res) => {
  const { serverKey, id } = req.params;
  try {
    const pool = await getGamePool(serverKey);
    await pool.request()
      .input('id', sql.Int, id)
      .query(`UPDATE dbo.Petitions SET Done = 1 WHERE ContainerId = @id`);
    res.redirect(`/admin/petitions/${serverKey}/${id}`);
  } catch (err) {
    console.error('Error marking done:', err);
    res.status(500).send('Internal server error');
  }
};

exports.toggleStatus = async (req, res) => {
  const { serverKey, id, field } = req.params;
  if (!['Fetched', 'Done'].includes(field)) return res.status(400).send('Invalid field');

  try {
    const pool = await getGamePool(serverKey);
    // Get current value
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT ${field} FROM dbo.Petitions WHERE ContainerId = @id`);

    if (result.recordset.length === 0) return res.status(404).send('Not found');
    const current = result.recordset[0][field];

    // Toggle value
    await pool.request()
      .input('id', sql.Int, id)
      .query(`UPDATE dbo.Petitions SET ${field} = ${current ? 0 : 1} WHERE ContainerId = @id`);

    res.redirect(`/admin/petitions/${serverKey}/${id}`);
  } catch (err) {
    console.error('Error toggling petition status:', err);
    res.status(500).send('Internal server error');
  }
};
