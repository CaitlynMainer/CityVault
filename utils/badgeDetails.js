const fs = require('fs');
const path = require('path');

const badgeDetailsMap = {};
const badgeEquivalents = {};

let BADGE_BLACKLIST = new Set();
try {
  const blacklistPath = path.join(global.BASE_DIR, 'data', 'badges', 'blacklist.json');
  const json = fs.readFileSync(blacklistPath, 'utf8');
  const parsed = JSON.parse(json);
  if (Array.isArray(parsed)) {
    BADGE_BLACKLIST = new Set(parsed);
  }
} catch (e) {
  console.warn('[badgeDetails] No blacklist.json found or invalid, continuing without badge blacklist.');
}

function loadBadgeStrings() {
  const msPath = path.join(global.BASE_DIR, 'data', 'badges', 'Badges.ms');
  const map = {};

  if (!fs.existsSync(msPath)) {
    console.warn(`[badgeDetails] Badges.ms not found at ${msPath}, continuing with empty badge strings.`);
    return map;
  }

  try {
    const raw = fs.readFileSync(msPath, 'utf8');
    for (const line of raw.split('\n')) {
      const match = line.trim().match(/^"?P(\d+)"?\s+"(.*?)"$/);
      if (match) {
        const [, id, text] = match;
        map[`P${id}`] = text;
      }
    }
  } catch (err) {
    console.warn(`[badgeDetails] Failed to read Badges.ms: ${err.message}`);
  }

  return map;
}

function loadBadgeDefs(badgeStrings) {
  const badgeDir = path.join(global.BASE_DIR, 'data', 'badges');
  const files = fs.readdirSync(badgeDir).filter(f => f.toLowerCase().endsWith('.def'));
  const kvPattern = /^(\w+)\s+"?([^"]+)"?$/;

  for (const file of files.sort()) {
    const fullPath = path.join(badgeDir, file);
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
        if (!current.Name) {
          // console.warn(`[WARN] Skipped badge in ${file} — missing Name`);
        } else {
          badgeDetailsMap[current.Name] = current;
        }
        current = null;
        continue;
      }

      if (current) {
        const match = kvPattern.exec(trimmed);
        if (match) {
          const [, key, value] = match;
          const resolved = badgeStrings[value] || value;

          if (key === 'Name') {
            current.Name = resolved;

            if (BADGE_BLACKLIST.has(current.Name)) {
              //console.warn(`[BLACKLISTED] Skipping badge ${current.Name} from ${file}`);
              current = null;
              continue;
            }
          }

          if (key === 'DoNotCount' && resolved === '1') {
            // console.warn(`[WARN] Skipping badge ${current.Name} due to DoNotCount=1 in ${file}`);
            current = null;
            continue;
          }

          if (key === 'DisplayTitle' && (!resolved || resolved.trim() === '.' || resolved.trim() === '')) {
            // console.warn(`[WARN] Badge ${current.Name} has invalid DisplayTitle (${resolved}) in ${file}`);
            current = null;
            continue;
          }

          current[key] = resolved;
        }
      }
    }
  }
}


function buildBadgeEquivalents() {
  for (const [name, meta] of Object.entries(badgeDetailsMap)) {
    if (!meta.Requires) continue;

    if (meta.Requires.includes('praetorianprogress char> praetoria eq') ||
        meta.Requires.includes('praetorianprogress char> earth eq')) {
      const counterpart = name.replace(/^P_/, '');
      if (counterpart !== name && badgeDetailsMap[counterpart]) {
        badgeEquivalents[name] = counterpart;
        badgeEquivalents[counterpart] = name;
      }
    }

    if (meta.Requires.includes('praetorianprogress char> normal eq') ||
        meta.Requires.includes('praetorianprogress char> pvp eq')) {
      const counterpart = 'P_' + name;
      if (counterpart !== name && badgeDetailsMap[counterpart]) {
        badgeEquivalents[name] = counterpart;
        badgeEquivalents[counterpart] = name;
      }
    }
  }
}
buildBadgeEquivalents();

function init() {
  if (Object.keys(badgeDetailsMap).length === 0) {
    const badgeStrings = loadBadgeStrings();
    loadBadgeDefs(badgeStrings);
  }
}

function getBadgeDetails(internalName) {
  init();
  return badgeDetailsMap[internalName] || null;
}

function getAllBadges() {
  init();
  return badgeDetailsMap;
}

module.exports = {
  getBadgeDetails,
  getAllBadges,
  badgeEquivalents
};
