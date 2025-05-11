const fs = require('fs');
const path = require('path');

const attributesPath = path.join(global.BASE_DIR, 'data', 'vars.attribute');
const raw = fs.readFileSync(attributesPath, 'utf8');

const attributes = {};

for (const line of raw.split('\n')) {
  const match = line.trim().match(/^(\d+)\s+"(.+)"$/);
  if (match) {
    const id = parseInt(match[1], 10);
    const name = match[2];
    attributes[id] = name;
  }
}

module.exports = attributes;
