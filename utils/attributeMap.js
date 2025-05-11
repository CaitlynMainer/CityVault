const fs = require('fs');
const path = require('path');

const attributePath = path.join(global.BASE_DIR, 'data', 'vars.attribute');
const attributeMap = {};

try {
  const raw = fs.readFileSync(attributePath, 'utf8');
  raw.split('\n').forEach(line => {
    const match = line.trim().match(/^(\d+)\s+"(.+)"$/);
    if (match) {
      const id = parseInt(match[1], 10);
      const name = match[2];
      attributeMap[id] = name;
    }
  });
} catch (err) {
  if (err.code === 'ENOENT') {
    console.warn(`[WARN] attributeMap: File not found at ${attributePath}. Proceeding with empty map.`);
  } else {
    console.error(`[ERROR] Failed to read attributeMap:`, err);
  }
}

module.exports = attributeMap;
