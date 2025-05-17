const fs = require('fs');
const path = require('path');
const config = require(global.BASE_DIR + '/utils/config');

const BADGE_ENT_MAX_BADGES = 4096;
const BITS_PER_ITEM = 32;
const BITFIELD_SIZE = Math.max(Math.ceil(BADGE_ENT_MAX_BADGES / BITS_PER_ITEM), 263);

const badgeData = {
  i24: null,
  i25: null
};

function getVersionForServer(serverKey) {
  return config.servers?.[serverKey]?.badgeVersion === 'i24' ? 'i24' : 'i25';
}

function loadBadgeData(version) {
  if (badgeData[version]) return badgeData[version];

  const baseDir = path.join(global.BASE_DIR, 'data', version, 'badges');
  const attrPath = path.join(baseDir, 'badges.attribute');
  const badgeAttributeMap = {};
  const badgeDetailsMap = {};

  // Load attribute map
  try {
    const raw = fs.readFileSync(attrPath, 'utf8');
    for (const line of raw.split('\n')) {
      const match = line.trim().match(/^(\d+)\s+\"(.+)\"$/);
      if (match) {
        badgeAttributeMap[parseInt(match[1], 10)] = match[2];
      }
    }
  } catch (err) {
    console.warn(`[badgeParser] Missing or unreadable: ${attrPath}`);
  }

  // Load badge details from .def
  const defFiles = fs.readdirSync(baseDir).filter(f => f.toLowerCase().endsWith('.def'));
  const kvPattern = /^(\w+)\s+"?([^\"]+)"?$/;

  for (const file of defFiles) {
    const fullPath = path.join(baseDir, file);
    const lines = fs.readFileSync(fullPath, 'utf8').split('\n');
    let current = null;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed === 'Badge') {
        current = { _sourceFile: file };
        continue;
      }

      if (trimmed === '}' && current) {
        if (current.Name) badgeDetailsMap[current.Name] = current;
        current = null;
        continue;
      }

      if (current) {
        const match = kvPattern.exec(trimmed);
        if (match) {
          const [, key, value] = match;
          current[key] = value;
        }
      }
    }
  }

  badgeData[version] = { badgeAttributeMap, badgeDetailsMap };
  return badgeData[version];
}

function getOwnedBadgesFromBitfield(hexString, serverKey) {
  const version = getVersionForServer(serverKey);
  const { badgeAttributeMap, badgeDetailsMap } = loadBadgeData(version);
  hexString = hexString.padEnd(BITFIELD_SIZE * 8, '0');
  const buffer = Buffer.from(hexString, 'hex');
  const results = [];

  for (let i = 0; i < BADGE_ENT_MAX_BADGES; i++) {
    const wordIndex = Math.floor(i / BITS_PER_ITEM);
    const bitIndex = i % BITS_PER_ITEM;
    const offset = wordIndex * 4;
    if (offset + 4 > buffer.length) continue;

    const word = buffer.readUInt32LE(offset);
    const bitSet = (word >> bitIndex) & 1;
    if (!bitSet) continue;

    const internalName = badgeAttributeMap[i];
    const meta = internalName ? badgeDetailsMap[internalName] : null;
    if (!internalName || !meta) continue;

    if (parseInt(meta.DoNotCount) === 1) continue;
    if (meta.Category === 'kInternal' || meta.Category === 'kNone') continue;

    const title = meta.DisplayTitle || '';
    if (!title.trim() || title === '.') continue;

    const stripExtension = s => s.trim().replace(/\.(tga|psd)$/i, '');

    results.push({
      badgeId: i,
      internalName,
      DisplayTitle: title,
      DisplayTitleVillain: meta.DisplayTitleVillain || title,
      Icon: stripExtension(meta.Icon || ''),
      VillainIcon: stripExtension(meta.VillainIcon || ''),
      Category: meta.Category || 'Uncategorized'
    });
  }

  return results;
}

module.exports = {
  getOwnedBadgesFromBitfield
};
