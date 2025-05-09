const fs = require('fs');
const path = require('path');

const configPath = path.join(global.BASE_DIR, 'data', 'config.json');

function loadConfig() {
  if (!fs.existsSync(configPath)) {
    throw new Error('Missing config.json');
  }

  const data = fs.readFileSync(configPath);
  return JSON.parse(data);
}

module.exports = loadConfig();
