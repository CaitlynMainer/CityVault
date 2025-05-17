const fs = require('fs');
const path = require('path');
const config = require(global.BASE_DIR + '/utils/config');

const badgeData = {
  i24: { badgeDetailsMap: {}, badgeEquivalents: {} },
  i25: { badgeDetailsMap: {}, badgeEquivalents: {} }
};

let BADGE_BLACKLIST = new Set();
try {
  const blacklistPath = path.join(global.BASE_DIR, 'data', 'badges_blacklist.json');
  const json = fs.readFileSync(blacklistPath, 'utf8');
  const parsed = JSON.parse(json);
  if (Array.isArray(parsed)) {
    BADGE_BLACKLIST = new Set(parsed);
  }
} catch (e) {
  console.warn('[badgeDetails] No badges_blacklist.json found or invalid, continuing without badge blacklist.');
}

function stripExtension(str) {
  return str?.trim().replace(/\.(tga|psd)$/i, '') || '';
}

function loadBadgeStrings(baseDir) {
  const map = {};

  if (!fs.existsSync(baseDir)) {
    console.warn(`[badgeDetails] Badge directory not found at ${baseDir}, continuing with empty badge strings.`);
    return map;
  }

  try {
    const files = fs.readdirSync(baseDir).filter(file => file.toLowerCase().endsWith('.ms'));

    for (const file of files) {
      const fullPath = path.join(baseDir, file);

      let raw = '';
      try {
        raw = fs.readFileSync(fullPath, 'utf8');
      } catch (err) {
        console.warn(`[badgeDetails] Failed to read ${file}: ${err.message}`);
        continue;
      }

      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        const match = trimmed.match(/^"?P(\d+)"?\s+"(.*)"$/);
        if (match) {
          const [, id, text] = match;
          map[`P${id}`] = text;
        }
      }
    }
  } catch (err) {
    console.warn(`[badgeDetails] Error while reading badge strings: ${err.message}`);
  }

  return map;
}

function loadBadgeDefs(baseDir, badgeStrings, mapTarget) {
  const files = fs.readdirSync(baseDir).filter(f => f.toLowerCase().endsWith('.def'));
  const kvPattern = /^(\w+)\s+"?([^"]+)"?$/;

  for (const file of files.sort()) {
    const fullPath = path.join(baseDir, file);
    const lines = fs.readFileSync(fullPath, 'utf8').split('\n');

    let current = null;
    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed === 'Badge') {
        current = {};
        current._sourceFile = file;
        continue;
      }

      if (trimmed === '}' && current) {
        if (current.Name && !BADGE_BLACKLIST.has(current.Name)) {
          mapTarget[current.Name] = current;
        }
        current = null;
        continue;
      }

      if (current) {
        const match = kvPattern.exec(trimmed);
        if (match) {
          const [, key, value] = match;
          let resolved = badgeStrings[value] || value;

          if (key === 'Name') {
            current.Name = resolved;
            if (BADGE_BLACKLIST.has(current.Name)) {
              current = null;
              continue;
            }
          }

          if (key === 'DoNotCount' && resolved === '1') {
            current = null;
            continue;
          }

          if (key === 'DisplayTitle' && (!resolved || resolved.trim() === '.' || resolved.trim() === '')) {
            current = null;
            continue;
          }

          if (key === 'Icon' || key === 'VillainIcon') {
            resolved = stripExtension(resolved);
          }

          current[key] = resolved;
        }
      }
    }
  }
}

function buildBadgeEquivalents(map, target) {
  for (const [name, meta] of Object.entries(map)) {
    if (!meta.Requires) continue;

    if (meta.Requires.includes('praetorianprogress char> praetoria eq') ||
        meta.Requires.includes('praetorianprogress char> earth eq')) {
      const counterpart = name.replace(/^P_/, '');
      if (counterpart !== name && map[counterpart]) {
        target[name] = counterpart;
        target[counterpart] = name;
      }
    }

    if (meta.Requires.includes('praetorianprogress char> normal eq') ||
        meta.Requires.includes('praetorianprogress char> pvp eq')) {
      const counterpart = 'P_' + name;
      if (counterpart !== name && map[counterpart]) {
        target[name] = counterpart;
        target[counterpart] = name;
      }
    }
  }
}



function loadBadgeSet(version) {
  const baseDir = path.join(global.BASE_DIR, 'data', version, 'badges');
  const badgeStrings = loadBadgeStrings(baseDir);
  loadBadgeDefs(baseDir, badgeStrings, badgeData[version].badgeDetailsMap);
  buildBadgeEquivalents(badgeData[version].badgeDetailsMap, badgeData[version].badgeEquivalents);
  console.log(`[Equivalents] Built ${Object.keys(badgeData[version].badgeEquivalents).length} equivalents for ${version}`);
}

function init() {
  if (Object.keys(badgeData.i24.badgeDetailsMap).length === 0) loadBadgeSet('i24');
  if (Object.keys(badgeData.i25.badgeDetailsMap).length === 0) loadBadgeSet('i25');
}

function getVersionForServer(serverKey) {
  return config.servers?.[serverKey]?.badgeVersion === 'i24' ? 'i24' : 'i25';
}

function getBadgeDetails(internalName, serverKey) {
  init();
  const version = getVersionForServer(serverKey);
  return badgeData[version].badgeDetailsMap[internalName] || null;
}

function getAllBadges(serverKey) {
  init();
  const version = getVersionForServer(serverKey);
  return badgeData[version].badgeDetailsMap;
}

function getBadgeEquivalents(serverKey) {
  init();
  const version = getVersionForServer(serverKey);
  return badgeData[version].badgeEquivalents;
}

module.exports = {
  getBadgeDetails,
  getAllBadges,
  getBadgeEquivalents
};
