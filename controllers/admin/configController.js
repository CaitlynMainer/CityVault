const path = require('path');
const fs = require('fs');
const configPath = path.join(global.BASE_DIR, 'data/config.json');

function cleanKeys(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;

  const cleaned = Array.isArray(obj) ? [] : {};

  for (const key in obj) {
    if (key === '_key') continue;

    const value = cleanKeys(obj[key]);

    // Convert specific numeric strings to numbers
    if (['dbPort', 'intervalMinutes', 'accessRetentionDays'].includes(key) && typeof value === 'string' && /^\d+$/.test(value)) {
      cleaned[key] = parseInt(value, 10);
    } else if (key === 'compress') {
      // Handle checkbox-like true/false
      cleaned[key] = (value === 'true' || value === true);
    } else {
      cleaned[key] = value;
    }
  }

  return cleaned;
}

exports.showEditor = (req, res) => {
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
  try {
    const postedConfig = req.body.config;
    const cleaned = cleanKeys(postedConfig);

    // Backup current config
    fs.copyFileSync(configPath, configPath + '.bak');

    // Save cleaned config
    fs.writeFileSync(configPath, JSON.stringify(cleaned, null, 4));
    fs.writeFileSync(path.join(global.BASE_DIR, 'data/.config-reload'), '');

    req.flash('success', 'Configuration saved successfully.');
  } catch (err) {
    console.error('Failed to save config:', err);
    req.flash('error', 'Error saving config: ' + err.message);
  }

  res.redirect('/admin/config');
};
