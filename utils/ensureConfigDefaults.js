const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(global.BASE_DIR, 'data', 'config.json');

function ensureConfigDefaults(keyOrSection, defaultValue) {
  let config = {};
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
  } catch (err) {
    console.error('[ERROR] Failed to read config.json:', err);
  }

  let updated = false;

  if (typeof keyOrSection === 'string') {
    // Single key patch
    if (!(keyOrSection in config)) {
      config[keyOrSection] = defaultValue;
      updated = true;
    }
  } else if (typeof keyOrSection === 'object' && keyOrSection !== null) {
    // Section object patch
    for (const sectionKey in keyOrSection) {
      const defaults = keyOrSection[sectionKey];

      if (!(sectionKey in config)) {
        config[sectionKey] = defaults;
        updated = true;
      } else if (typeof defaults === 'object' && defaults !== null) {
        if (typeof config[sectionKey] !== 'object' || config[sectionKey] === null) {
          config[sectionKey] = {};
          updated = true;
        }

        for (const subKey in defaults) {
          if (!(subKey in config[sectionKey])) {
            config[sectionKey][subKey] = defaults[subKey];
            updated = true;
          }
        }
      }
    }
  }

  if (updated) {
    try {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
      fs.writeFileSync(path.join(global.BASE_DIR, 'data/.config-reload'), '');
      console.log('[INFO] Patched missing config values.');
    } catch (err) {
      console.error('[ERROR] Failed to write config.json:', err);
    }
  }
}

module.exports = ensureConfigDefaults;
