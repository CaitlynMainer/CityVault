const fs = require('fs');
const path = require('path');
const { getAllBadges } = require('./badgeDetails'); // assumes badgeDetailsMap is built here

const attributePath = path.join(global.BASE_DIR, 'data', 'badges', 'badges.attribute');
const badgeAttributeMap = {};

try {
  const raw = fs.readFileSync(attributePath, 'utf8');

  const badgeDetailsMap = getAllBadges();
  const knownNames = Object.keys(badgeDetailsMap);
  const normalizedMap = {};

  // Build a lowercase index of valid badge names for correction
  for (const name of knownNames) {
    normalizedMap[name.toLowerCase()] = name;
  }

  raw.split('\n').forEach((line) => {
    const match = line.trim().match(/^(\d+)\s+"(.+)"$/);
    if (match) {
      const id = parseInt(match[1], 10);
      const rawName = match[2];
      const correctedName = normalizedMap[rawName.toLowerCase()] || rawName;
      badgeAttributeMap[id] = correctedName;
    }
  });
} catch (err) {
  if (err.code === 'ENOENT') {
    console.warn(`[WARN] badgeAttributeMap: File not found at ${attributePath}. Proceeding with empty map.`);
  } else {
    console.error(`[ERROR] Failed to read badgeAttributeMap:`, err);
  }
}

module.exports = badgeAttributeMap;
