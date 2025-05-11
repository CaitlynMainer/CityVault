const fs = require('fs');
const path = require('path');

const blacklistPath = path.join(global.BASE_DIR, 'data', 'badges', 'blacklist.json');

function loadBlacklist() {
  try {
    const data = fs.readFileSync(blacklistPath, 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function saveBlacklist(entries) {
  const cleaned = entries
    .map(e => e.trim())
    .filter(e => e && !e.startsWith('#'));

  // Basic validation: must be array of strings with safe characters
  for (const name of cleaned) {
    if (!/^[A-Za-z0-9_]+$/.test(name)) {
      throw new Error(`Invalid badge name: "${name}"`);
    }
  }

  // Save only if validation passed
  fs.writeFileSync(blacklistPath, JSON.stringify(cleaned, null, 2), 'utf8');
}


function showBlacklist(req, res) {
  const blacklist = loadBlacklist();
  res.render('admin/edit_blacklist', { blacklist });
}

function updateBlacklist(req, res) {
  const rawInput = req.body.blacklist || '';
  const lines = rawInput.split('\n');

  try {
    saveBlacklist(lines);
    res.redirect('/admin/edit_blacklist');
  } catch (err) {
    const blacklist = lines.map(e => e.trim()).filter(e => e && !e.startsWith('#'));
    res.render('admin/edit_blacklist', {
      blacklist,
      error: err.message
    });
  }
}

module.exports = {
  showBlacklist,
  updateBlacklist
};
