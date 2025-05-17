const fs = require('fs');
const path = require('path');
const config = require(global.BASE_DIR + '/utils/config');
const { getAllBadges } = require('./badgeDetails');

const loadedMaps = {}; // Cache maps per version

function getVersionForServer(serverKey) {
  return config.servers?.[serverKey]?.badgeVersion === 'i24' ? 'i24' : 'i25';
}

function loadAttributeMapForVersion(version) {
  if (loadedMaps[version]) return loadedMaps[version];

  const attributePath = path.join(global.BASE_DIR, 'data', version, 'badges', 'badges.attribute');
  const map = {};
  loadedMaps[version] = map; // cache immediately to avoid re-entry

  try {
    const raw = fs.readFileSync(attributePath, 'utf8');

    const badgeDetailsMap = getAllBadgesByVersion(version); // load directly from badgeDetails.js
    const knownNames = Object.keys(badgeDetailsMap);
    const normalizedMap = {};

    for (const name of knownNames) {
      normalizedMap[name.toLowerCase()] = name;
    }

    raw.split('\n').forEach((line) => {
      const match = line.trim().match(/^(\d+)\s+"(.+)"$/);
      if (match) {
        const id = parseInt(match[1], 10);
        const rawName = match[2];
        const correctedName = normalizedMap[rawName.toLowerCase()] || rawName;
        map[id] = correctedName;
      }
    });
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.warn(`[WARN] badgeAttributeMap: File not found at ${attributePath}. Proceeding with empty map.`);
    } else {
      console.error(`[ERROR] Failed to read badgeAttributeMap for version ${version}:`, err);
    }
  }

  return map;
}

function getBadgeAttributeMap(serverKey) {
  const version = getVersionForServer(serverKey);
  return loadAttributeMapForVersion(version);
}

function getAllBadgesByVersion(version) {
  const { getAllBadges } = require('./badgeDetails');
  return getAllBadges(version); // overload getAllBadges to accept version key
}

module.exports = {
  getBadgeAttributeMap
};

