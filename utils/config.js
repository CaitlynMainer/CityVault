const fs = require('fs');
const path = require('path');

const configPath = path.join(global.BASE_DIR, 'data', 'config.json');
const defaultPath = path.join(global.BASE_DIR, 'data', 'config.json-default');

if (!fs.existsSync(configPath)) {
  if (fs.existsSync(defaultPath)) {
    console.error('[ERROR] config.json-default exists. Did you forget to copy it to config.json?');
  }
  process.exit(1);
}

const data = fs.readFileSync(configPath, 'utf8');
module.exports = JSON.parse(data);
