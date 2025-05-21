const sql = require('mssql');
const config = require(global.BASE_DIR + '/utils/config');
const { getGamePool, getAuthPool } = require(global.BASE_DIR + '/db');
const { stringClean } = require(global.BASE_DIR + '/utils/textSanitizer');

async function list(req, res) {
  const username = req.session.username;
  if (!username) return res.status(401).send('Unauthorized');

  const allPetitions = [];

  for (const serverKey of Object.keys(config.servers)) {
    const pool = await getGamePool(serverKey);
    const result = await pool.request()
      .input('authName', sql.VarChar(32), username)
      .query(`SELECT *, '${serverKey}' AS serverKey FROM dbo.Petitions WHERE AuthName = @authName`);

    allPetitions.push(...result.recordset);
  }

  allPetitions.sort((a, b) => new Date(b.Date) - new Date(a.Date));

  res.render('account/petitions/list', { petitions: allPetitions });
};

async function view(req, res) {
  const { serverKey, id } = req.params;
  const username = req.session.username;

  if (!username) return res.status(401).send('Unauthorized');

  try {
    const pool = await getGamePool(serverKey);
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('authName', sql.VarChar(32), username)
      .query(`SELECT * FROM dbo.Petitions WHERE ContainerId = @id AND AuthName = @authName`);

    if (result.recordset.length === 0) return res.status(404).send('Petition not found or not yours');

    const petition = result.recordset[0];
    petition.Summary = stringClean(petition.Summary);
    petition.Msg = stringClean(petition.Msg);

    const commentResult = await pool.request()
      .input('petition_id', sql.Int, id)
      .query(`SELECT * FROM dbo.PetitionComments WHERE petition_id = @petition_id ORDER BY posted ASC`);

    petition.comments = commentResult.recordset;

    res.render('account/petitions/view', { petition, serverKey });
  } catch (err) {
    console.error('Error loading petition:', err);
    res.status(500).send('Internal server error');
  }
}

async function addComment(req, res) {
  const { serverKey, id } = req.params;
  const { comment } = req.body;
  const username = req.session.username;

  if (!username || !comment) return res.status(400).send('Missing comment or session');

  try {
    const pool = await getGamePool(serverKey);

    // Ensure petition belongs to user before allowing comment
    const verify = await pool.request()
      .input('id', sql.Int, id)
      .input('authName', sql.VarChar(32), username)
      .query(`SELECT * FROM dbo.Petitions WHERE ContainerId = @id AND AuthName = @authName`);

    if (verify.recordset.length === 0) return res.status(403).send('Not your petition');

    await pool.request()
      .input('petition_id', sql.Int, id)
      .input('author', sql.VarChar(32), username)
      .input('is_admin', sql.Bit, 0)
      .input('body', sql.Text, comment)
      .query(`
        INSERT INTO dbo.PetitionComments (petition_id, author, is_admin, body)
        VALUES (@petition_id, @author, @is_admin, @body)
      `);

    res.redirect(`/account/petitions/${serverKey}/${id}`);
  } catch (err) {
    console.error('Error posting comment:', err);
    res.status(500).send('Server error');
  }
}

module.exports = {
  list, // your existing list
  view,
  addComment
};