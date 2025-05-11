const sql = require('mssql');
const { getGamePool } = require(global.BASE_DIR + '/db');
const attributeMap = require(global.BASE_DIR + '/utils/attributeMap');
const { getOwnedBadgesFromBitfield } = require(global.BASE_DIR + '/utils/badgeParser');
const { getBadgeDetails, getAllBadges, badgeEquivalents } = require(global.BASE_DIR + '/utils/badgeDetails');
const { getAlignment } = require(global.BASE_DIR + '/utils/alignment');
const { stringClean } = require('../utils/textSanitizer');
const fs = require('fs');

const CATEGORY_LABELS = {
  kAccomplishment: 'Accomplishments',
  kAchievement: 'Achievements',
  kArchitect: ' Architect Entertainment',
  kAuction: 'Wentworths',
  kDayJob: 'Day Jobs',
  kDefeat: 'Defeats',
  kEvent: 'Event',
  kFlashback: 'Ouroboros',
  kGladiator: 'Gladiators',
  kHistory: 'History',
  kInvention: 'Invention',
  kPerk: 'Accolade',
  kPvP: 'PvP',
  kTourism: 'Exploration',
  kVeteran: 'Veteran',
  Uncategorized: 'Other'
};

function resolveGenderString(raw, gender) {
  if (!raw || !raw.includes('{Hero.gender=')) return raw;
  return raw.replace(/\{Hero\.gender=male\s+([^|{}]+)\|([^}]+)\}/g, (_, maleForm, femaleForm) => {
    if (gender === 1 || gender === 2) return maleForm;
    if (gender === 3) return femaleForm;
    return maleForm;
  });
}

function getBadgeAlignmentContext(rpn) {
  if (!rpn) return [];
  const normalized = rpn.toLowerCase();
  const a = [];

  if (normalized.includes('praetorianprogress char> praetoria eq') ||
      normalized.includes('praetorianprogress char> earth eq')) {
    a.push('Resistance', 'Loyalist');
  }

  if (normalized.includes('praetorianprogress char> normal eq')) {
    a.push('Hero', 'Villain', 'Vigilante', 'Rogue');
  }

  if (normalized.includes('praetorianprogress char> pvp eq')) {
    a.push('PvP');
  }

  return a;
}

function getVisibleBadges(allBadgeDetails, ownedBadges, alignment, gender) {
  const ownedNames = new Set(ownedBadges.map(b => b.internalName));
  const visibleBadges = [];

  const isVillainAligned = ['Villain', 'Rogue', 'Loyalist'].includes(alignment);

  for (const [name, meta] of Object.entries(allBadgeDetails)) {
    if (!meta.DisplayTitle || meta.DisplayTitle === '.') continue;
    if (meta.Category === 'kInternal' || meta.Category === 'kNone') continue;

    const isOwned = ownedNames.has(name);
    const altName = badgeEquivalents[name];
    const altOwned = altName && ownedNames.has(altName);

    const resolvedDisplayTitle = resolveGenderString(meta.DisplayTitle, gender);
    const resolvedVillainTitle = resolveGenderString(meta.DisplayTitleVillain || meta.DisplayTitle, gender);

    if (altOwned && !isOwned) continue;

    if (meta.Requires) {
      const allowedAlignments = getBadgeAlignmentContext(meta.Requires);
      if (
        allowedAlignments.length > 0 &&
        !allowedAlignments.includes(alignment)
      ) {
        //console.warn(`Skipping ${name} due to alignment mismatch: ${alignment} not in [${allowedAlignments.join(', ')}]`);
        continue;
      }
    }

    const image = isVillainAligned && meta.VillainIcon ? meta.VillainIcon : meta.Icon;

    visibleBadges.push({
      ...meta,
      badgeId: meta.badgeId,
      internalName: name,
      owned: isOwned,
      DisplayTitle: resolvedDisplayTitle,
      DisplayTitleVillain: resolvedVillainTitle,
      CategoryLabel: CATEGORY_LABELS[meta.Category || 'Uncategorized'] || meta.Category,
      image: image || ''
    });
  }

  return visibleBadges;
}

async function showCharacter(req, res) {
  const [serverKey, dbidStr] = (req.params.id || '').split(':');
  const dbid = parseInt(dbidStr);

  if (!serverKey || isNaN(dbid)) {
    return res.status(400).send('Invalid character ID format.');
  }

  try {
    const pool = await getGamePool(serverKey);

    const charResult = await pool.request()
      .input('dbid', sql.Int, dbid)
      .query(`
        SELECT 
          e.ContainerId,
          e.Name,
          e.Level,
          e.Class,
          e.Origin,
          e.AuthId,
          e.Description,
          e.Motto,
          e.DateCreated,
          e.Gender,
          e.BodyType,
          e.PlayerType,
          en2.originalPrimary,
          en2.originalSecondary,
          en2.PlayerSubType,
          en2.PraetorianProgress
        FROM dbo.Ents e
        JOIN dbo.Ents2 en2 ON e.ContainerId = en2.ContainerId
        WHERE e.ContainerId = @dbid
      `);

    if (!charResult.recordset.length) {
      return res.status(404).send('Character not found.');
    }

    const character = charResult.recordset[0];
    character.Level += 1;
    character.ClassName = attributeMap[character.Class]?.replace(/^Class_/, '') || `Class ${character.Class}`;
    character.OriginName = attributeMap[character.Origin] || `Origin ${character.Origin}`;
    character.alignment = getAlignment(character.PlayerType, character.PlayerSubType, character.PraetorianProgress);

    const badgeResult = await pool.request()
      .input('dbid', sql.Int, dbid)
      .query(`SELECT Owned FROM dbo.Badges WHERE ContainerId = @dbid`);

    const badgeBitfield = badgeResult.recordset[0]?.Owned || '';
    const ownedBadgeIds = getOwnedBadgesFromBitfield(badgeBitfield);

    const allBadgeDetails = getAllBadges();
    const visibleBadges = getVisibleBadges(allBadgeDetails, ownedBadgeIds, character.alignment, character.Gender);
    const totalBadges = visibleBadges.length;
    const ownedBadges = visibleBadges.filter(b => b.owned).length;
    const unearnedBadges = visibleBadges.filter(b => !b.owned);
    
    const unearnedBadgeCategories = groupBadgesByCategory(unearnedBadges);
    const badgeCategories = {};

    for (const badge of visibleBadges) {
      const label = badge.CategoryLabel || badge.Category || 'Uncategorized';

      if (!badgeCategories[label]) {
        badgeCategories[label] = {
          name: label,
          owned: 0,
          total: 0,
          badges: []
        };
      }

      badgeCategories[label].total++;
      if (badge.owned) badgeCategories[label].owned++;
      badgeCategories[label].badges.push(badge);
    }

    const badgeCategoryList = Object.values(badgeCategories).sort((a, b) => a.name.localeCompare(b.name));

    res.render('character', {
      title: `Character: ${character.Name}`,
      character,
      serverKey,
      badgeCategoryList,
      totalBadges,
      ownedBadges,
      unearnedBadgeCategories
    });

  } catch (err) {
    console.error(err);
    res.status(500).send('Server error loading character.');
  }
}

function groupBadgesByCategory(badges) {
  const groups = {};
  for (const badge of badges) {
    const cat = badge.Category || 'Uncategorized';
    if (!groups[cat]) {
      groups[cat] = {
        name: badge.CategoryLabel,
        count: 0,
        badges: []
      };
    }
    groups[cat].count++;
    groups[cat].badges.push(badge);
  }

  return Object.values(groups).sort((a, b) => a.name.localeCompare(b.name));
}


module.exports = {
  showCharacter
};
