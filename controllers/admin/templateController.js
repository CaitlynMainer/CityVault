const fs = require('fs');
const path = require('path');
const { isGM } = require(global.BASE_DIR + '/utils/roles');
const templatesDir = path.join(global.BASE_DIR, 'userContent', 'views', 'emails');
const { isAdmin } = require(global.BASE_DIR + '/utils/roles');

function listTemplates(req, res) {
  if (!isAdmin(req.user?.role)) {
    return res.status(403).send('Forbidden');
  }
  try {
    const templates = fs.readdirSync(templatesDir)
      .filter(file => file.endsWith('.ejs'))
      .map(file => path.basename(file, '.ejs'))
      .filter(name => !!name); // filter out empty or undefined entries

    res.render('admin/templates/index', {
      templates,
      messages: req.flash()
    });
  } catch (err) {
    console.error('[Template List Error]', err);
    req.flash('error', 'Unable to list templates.');
    res.redirect('/admin');
  }
}

function showEditTemplate(req, res) {
  if (!isAdmin(req.user?.role)) {
    return res.status(403).send('Forbidden');
  }
  const name = req.params.name;
  const filePath = path.join(templatesDir, `${name}.ejs`);

  if (!/^[\w-]+$/.test(name)) {
    req.flash('error', 'Invalid template name.');
    return res.redirect('/admin/templates');
  }

  if (!fs.existsSync(filePath)) {
    req.flash('error', 'Template not found.');
    return res.redirect('/admin/templates');
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    res.render('admin/templates/edit', {
      name,
      content,
      messages: req.flash()
    });
  } catch (err) {
    console.error('[Read Template Error]', err);
    req.flash('error', 'Unable to load template.');
    res.redirect('/admin/templates');
  }
}

function saveTemplate(req, res) {
  if (!isAdmin(req.user?.role)) {
    return res.status(403).send('Forbidden');
  }
  const name = req.params.name;
  const filePath = path.join(templatesDir, `${name}.ejs`);

  if (!/^[\w-]+$/.test(name)) {
    req.flash('error', 'Invalid template name.');
    return res.redirect('/admin/templates');
  }

  try {
    fs.writeFileSync(filePath, req.body.content, 'utf-8');
    req.flash('success', `Template "${name}" saved successfully.`);
  } catch (err) {
    console.error('[Save Template Error]', err);
    req.flash('error', 'Failed to save template.');
  }

  res.redirect('/admin/templates');
}

module.exports = {
  listTemplates,
  showEditTemplate,
  saveTemplate
};
