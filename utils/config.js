const fs = require('fs');
const path = require('path');

const configPath = path.join(global.BASE_DIR, 'data', 'config.json');
const defaultPath = path.join(global.BASE_DIR, 'data', 'config.json-default');
const reloadFlagPath = path.join(global.BASE_DIR, 'data', '.config-reload');
const { reloadScheduledTasks } = require(global.BASE_DIR + '/services/scheduler');

if (!fs.existsSync(configPath)) {
  if (fs.existsSync(defaultPath)) {
    console.error('[ERROR] config.json-default exists. Did you forget to copy it to config.json?');
  }
  process.exit(1);
}

let cachedConfig = null;

function loadConfig() {
  const shouldReload = fs.existsSync(reloadFlagPath);

  if (!cachedConfig || shouldReload) {
    console.log(`[config] Reloading config from ${configPath}`);
    const data = fs.readFileSync(configPath, 'utf8');
    cachedConfig = JSON.parse(data);

    if (shouldReload) {
      try {
        fs.unlinkSync(reloadFlagPath);
        console.log('[config] Cleared .config-reload flag');
        reloadScheduledTasks();
      } catch (err) {
        console.warn('[config] Failed to remove .config-reload flag:', err.message);
      }
    }
  }

  return cachedConfig;
}

module.exports = new Proxy({}, {
  get(_, prop) {
    const config = loadConfig();
    return config[prop];
  }
});
