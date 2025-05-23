const path = require('path');
const fs = require('fs');
const configPath = path.join(global.BASE_DIR, 'data/config.json');
const { isAdmin } = require(global.BASE_DIR + '/utils/roles');

function cleanKeys(obj, existing = {}) {
  if (typeof obj !== 'object' || obj === null) return obj;

  const cleaned = Array.isArray(obj) ? [] : {};

  for (const key of new Set([...Object.keys(existing), ...Object.keys(obj)])) {
    if (key === '_key') continue;

    const newValue = obj[key];
    const oldValue = existing[key];

    if (typeof newValue === 'object' && newValue !== null && !Array.isArray(newValue)) {
      cleaned[key] = cleanKeys(newValue, oldValue || {});
    } else if (['dbPort', 'intervalMinutes', 'accessRetentionDays'].includes(key) && typeof newValue === 'string' && /^\d+$/.test(newValue)) {
      cleaned[key] = parseInt(newValue, 10);
    } else if (newValue === 'true' || (Array.isArray(newValue) && newValue.includes('true'))) {
      cleaned[key] = true;
    } else if (newValue === 'false' || (Array.isArray(newValue) && newValue.includes('false'))) {
      cleaned[key] = false;
    } else if (newValue !== undefined) {
      cleaned[key] = newValue;
    } else {
      // If new value is missing, preserve the old one
      cleaned[key] = oldValue;
    }
  }

  return cleaned;
}

exports.showEditor = (req, res) => {
  if (!isAdmin(req.user?.role)) {
    return res.status(403).send('Forbidden');
  }
  try {
    const config = JSON.parse(fs.readFileSync(configPath));
    res.render('admin/config_editor', {
      config,
      messages: req.flash()
    });
  } catch (err) {
    console.error('Failed to read config:', err);
    req.flash('error', 'Failed to load config.');
    res.redirect('/admin');
  }
};

exports.saveEditor = (req, res) => {
  if (!isAdmin(req.user?.role)) {
    return res.status(403).send('Forbidden');
  }
  try {
    const postedConfig = req.body.config;
    const existing = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const cleaned = cleanKeys(postedConfig, existing);

    fs.copyFileSync(configPath, configPath + '.bak');
    fs.writeFileSync(configPath, JSON.stringify(cleaned, null, 4));
    fs.writeFileSync(path.join(global.BASE_DIR, 'data/.config-reload'), '');

    req.flash('success', 'Configuration saved successfully.');
  } catch (err) {
    console.error('Failed to save config:', err);
    req.flash('error', 'Error saving config: ' + err.message);
  }

  res.redirect('/admin/config');
};
