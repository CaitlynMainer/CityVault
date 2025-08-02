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
    // Object merge patch
    for (const sectionKey in keyOrSection) {
      const defaults = keyOrSection[sectionKey];

      if (!(sectionKey in config)) {
        config[sectionKey] = defaults;
        updated = true;
        continue;
      }

      // If not both objects, skip deep merge
      const sectionIsObj = typeof config[sectionKey] === 'object' && config[sectionKey] !== null && !Array.isArray(config[sectionKey]);
      const defaultsIsObj = typeof defaults === 'object' && defaults !== null && !Array.isArray(defaults);

      if (!sectionIsObj || !defaultsIsObj) {
        continue; // Don't deep merge non-objects
      }

      for (const subKey in defaults) {
        const subDefault = defaults[subKey];

        if (!(subKey in config[sectionKey])) {
          config[sectionKey][subKey] = subDefault;
          updated = true;
        } else {
          const existing = config[sectionKey][subKey];
          const subIsObj = typeof existing === 'object' && existing !== null && !Array.isArray(existing);
          const subDefaultIsObj = typeof subDefault === 'object' && subDefault !== null && !Array.isArray(subDefault);

          if (subIsObj && subDefaultIsObj) {
            for (const nestedKey in subDefault) {
              if (!(nestedKey in existing)) {
                existing[nestedKey] = subDefault[nestedKey];
                updated = true;
              }
            }
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
