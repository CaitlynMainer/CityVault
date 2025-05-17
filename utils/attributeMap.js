const fs = require('fs');
const path = require('path');
const config = require(global.BASE_DIR + '/utils/config');

const attributeCache = {};

function getVersionForServer(serverKey) {
  return config.servers?.[serverKey]?.badgeVersion === 'i24' ? 'i24' : 'i25';
}

function getAttributeMap(serverKey) {
  const version = getVersionForServer(serverKey);
  if (attributeCache[version]) return attributeCache[version];

  const attributePath = path.join(global.BASE_DIR, 'data', version, 'vars.attribute');
  const map = {};
  attributeCache[version] = map;

  try {
    const raw = fs.readFileSync(attributePath, 'utf8');
    raw.split('\n').forEach(line => {
      const match = line.trim().match(/^(\d+)\s+"(.+)"$/);
      if (match) {
        const id = parseInt(match[1], 10);
        const name = match[2];
        map[id] = name;
      }
    });
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.warn(`[WARN] attributeMap: File not found at ${attributePath}. Proceeding with empty map.`);
    } else {
      console.error(`[ERROR] Failed to read attributeMap for version ${version}:`, err);
    }
  }

  return map;
}

module.exports = {
  getAttributeMap
};
