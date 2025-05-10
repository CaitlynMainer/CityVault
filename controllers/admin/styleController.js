const fs = require('fs');
const path = require('path');

const cssPath = path.join(global.BASE_DIR, 'public', 'css', 'custom.css');
const defaultPath = path.join(global.BASE_DIR, 'public', 'css', 'default.css');

exports.showStyleEditor = (req, res) => {
  fs.readFile(cssPath, 'utf8', (err, css) => {
    if (err || !css.trim()) {
      // fallback to default
      fs.readFile(defaultPath, 'utf8', (err2, defaultCss) => {
        return res.render('admin/style-editor', { css: err2 ? '' : defaultCss });
      });
    } else {
      res.render('admin/style-editor', { css });
    }
  });
};

exports.saveStyle = (req, res) => {
  const css = req.body.css;
  if (typeof css !== 'string') return res.status(400).send('Invalid CSS input.');

  fs.writeFile(cssPath, css, err => {
    if (err) return res.status(500).send('Failed to save CSS');
    res.redirect('/admin/style');
  });
};

exports.resetStyle = (req, res) => {
  fs.unlink(cssPath, err => {
    if (err && err.code !== 'ENOENT') return res.status(500).send('Failed to reset');
    res.redirect('/admin/style');
  });
};
