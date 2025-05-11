const fs = require('fs');
const path = require('path');
const { loadAllBadgeData } = require('./badgeDataCache');
const { attributeMap: badgeAttributeMap, detailsMap: badgeDetailsMap } = loadAllBadgeData();

const BADGE_ENT_MAX_BADGES = 4096;
const BITS_PER_ITEM = 32;
const BITFIELD_SIZE = Math.max(Math.ceil(BADGE_ENT_MAX_BADGES / BITS_PER_ITEM), 263);

// Load Badges.ms (string table)
const msPath = path.join(global.BASE_DIR, 'data', 'badges', 'Badges.ms');
const msRaw = fs.readFileSync(msPath, 'utf8');

const badgeMsMap = {};
let current = null;

for (const line of msRaw.split('\n')) {
  const trimmed = line.trim();
  if (trimmed.startsWith('Badge')) {
    const [, badgeName] = trimmed.match(/^Badge\s+(\w+)/) || [];
    if (badgeName) {
      current = badgeName;
      badgeMsMap[current] = {};
    }
  } else if (current && trimmed.includes(' ')) {
    const [key, ...rest] = trimmed.split(/\s+/);
    badgeMsMap[current][key] = rest.join(' ').replace(/^"|"$/g, '');
  }
}

function getOwnedBadgesFromBitfield(hexString) {
  hexString = hexString.padEnd(BITFIELD_SIZE * 8, '0');
  const buffer = Buffer.from(hexString, 'hex');
  const results = [];
  const rawBadgeIds = [];

  let totalSet = 0;
  let skippedNoMeta = 0;
  let skippedDot = 0;
  let skippedEmpty = 0;
  let skippedInternal = 0;
  let skippedFiltered = 0;
  const categoryCounts = {};
  const debugSkipped = [];

  for (let i = 0; i < BADGE_ENT_MAX_BADGES; i++) {
    const wordIndex = Math.floor(i / BITS_PER_ITEM);
    const bitIndex = i % BITS_PER_ITEM;
    const offset = wordIndex * 4;
    if (offset + 4 > buffer.length) continue;

    const word = buffer.readUInt32LE(offset);
    const bitSet = (word >> bitIndex) & 1;

    if (bitSet) {
      totalSet++;
      rawBadgeIds.push(i);

      const internalName = badgeAttributeMap[i];
      
      const meta = internalName ? badgeDetailsMap[internalName] : null;
      const src = meta?._sourceFile || 'unknown';
      const category = meta?.Category || 'Uncategorized';

      if (!internalName || !meta) {
        skippedNoMeta++;
        //console.warn(`Skipped: missing meta for badge ID ${i} (${internalName || 'unknown'})`);
        continue;
      }

      if (parseInt(meta?.DoNotCount) === 1) {
        skippedFiltered++;
        continue;
      }

      if (category === 'kInternal' || category === 'kNone') {
        skippedInternal++;
        //console.warn(`Skipped: kInternal badge ID ${i} (${internalName}) [${category}] from ${src}`);
        continue;
      }

      const title = meta.DisplayTitle || '';

      if (title === '.') {
        skippedDot++;
        //console.warn(`Skipped: "." title badge ID ${i} (${internalName}) [${category}] from ${src}`);
        debugSkipped.push({ badgeId: i, internalName, reason: 'dot', category, source: src });
        continue;
      }

      if (!title.trim()) {
        if (category === 'kTourism') {
          console.warn(`[Tourism] Skipped (empty title) badge ID ${i} (${internalName}) from ${src}`);
        }
        skippedEmpty++;
        //console.warn(`Skipped: empty title badge ID ${i} (${internalName}) [${category}] from ${src}`);
        debugSkipped.push({ badgeId: i, internalName, reason: 'empty', category, source: src });
        continue;
      }

      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
      results.push({
        badgeId: i,
        internalName,
        DisplayTitle: title,
        DisplayTitleVillain: meta.DisplayTitleVillain || title,
        Icon: meta.Icon || '',
        VillainIcon: meta.VillainIcon || '',
        Category: category
      });
    }
  }
  const tourismCount = results.filter(b => b.Category === 'kTourism').length;

  // Count total badges defined per category from badgeDetailsMap
  const totalByCategory = {};
  for (const meta of Object.values(badgeDetailsMap)) {
    const cat = meta?.Category || 'Uncategorized';
    totalByCategory[cat] = (totalByCategory[cat] || 0) + 1;
  }


  return results;
}


module.exports = {
  getOwnedBadgesFromBitfield
};
