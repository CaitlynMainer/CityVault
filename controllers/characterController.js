// Full updated characterController.js using modular characterInfo helpers with privacy check

const sql = require('mssql');
const { getGamePool, getAuthPool } = require(global.BASE_DIR + '/db');
const attributeMap = require(global.BASE_DIR + '/utils/attributeMap');
const { getOwnedBadgesFromBitfield } = require(global.BASE_DIR + '/utils/badgeParser');
const { getBadgeDetails, getAllBadges, badgeEquivalents } = require(global.BASE_DIR + '/utils/badgeDetails');
const { getAlignment } = require(global.BASE_DIR + '/utils/alignment');
const { getGlobalHandle } = require(global.BASE_DIR + '/utils/characterInfo/getGlobalHandle');
const { resolveSupergroupLink } = require(global.BASE_DIR + '/utils/characterInfo/resolveSupergroupLink');
const { enrichCharacter } = require(global.BASE_DIR + '/utils/characterInfo/formatCharacterDetails');
const { getPoolsAndAncillaries } = require(global.BASE_DIR + '/utils/characterInfo/powersetLoader');
const { stringClean } = require(global.BASE_DIR + '/utils/textSanitizer');
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

    const resolvedDisplayTitle = meta.DisplayTitle;
    const resolvedVillainTitle = meta.DisplayTitleVillain || meta.DisplayTitle;

    if (altOwned && !isOwned) continue;

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

async function showCharacter(req, res) {
  const [serverKey, dbidStr] = (req.params.id || '').split(':');
  const dbid = parseInt(dbidStr);

  if (!serverKey || isNaN(dbid)) {
    return res.status(400).send('Invalid character ID format.');
  }

  try {
    let pool;
    try {
      pool = await getGamePool(serverKey);
    } catch (err) {
      if (/Unknown server key/i.test(err.message)) {
        return res.status(404).render('error', {
          title: 'Unknown Server',
          message: `The server "${stringClean(serverKey)}" is not recognized.`
        });
      }
      throw err;
    }

    const charResult = await pool.request()
      .input('dbid', sql.Int, dbid)
      .query(`
        SELECT 
          e.ContainerId,
          e.SupergroupsId,
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
          e.ExperiencePoints,
          e.InfluencePoints,
          e.TotalTime,
          e.LoginCount,
          e.LastActive,
          e.TitleCommon,
          e.TitleOrigin,
          e.TitleSpecial,
          en2.originalPrimary,
          en2.originalSecondary,
          en2.PlayerSubType,
          en2.PraetorianProgress,
          en2.TitleTheText
        FROM dbo.Ents e
        JOIN dbo.Ents2 en2 ON e.ContainerId = en2.ContainerId
        WHERE e.ContainerId = @dbid
      `);

    if (!charResult.recordset.length) {
      return res.status(404).send('Character not found.');
    }

    let character = charResult.recordset[0];

    // 🔒 Privacy check
    const authPool = await getAuthPool();
    const authResult = await authPool.request()
      .input('uid', sql.Int, character.AuthId)
      .query(`SELECT tracker, account FROM dbo.user_account WHERE uid = @uid`);

    const owner = authResult.recordset[0];
    if (!owner) return res.status(404).send('Character owner not found');

    const viewerUsername = req.session?.username;
    let isAdmin = false;
    let isOwner = false;

    if (viewerUsername) {
      const viewerCheck = await authPool.request()
        .input('viewer', sql.VarChar, viewerUsername)
        .query(`SELECT role FROM dbo.user_account WHERE account = @viewer`);
      isAdmin = viewerCheck.recordset[0]?.role === 'admin';
      isOwner = viewerUsername === owner.account;
    }

    let forcedAccess = false;
    if (owner.tracker !== '1') {
      if (isAdmin) {
        forcedAccess = true;
      } else if (!isOwner) {
        return res.render('character', {
          title: 'Private Character',
          message: 'This character is part of a private profile and cannot be viewed.',
          character: null,
          serverKey,
          badgeCategoryList: [],
          totalBadges: 0,
          ownedBadges: 0,
          unearnedBadgeCategories: []
        });
      }
    }

    character.ClassName = attributeMap[character.Class]?.replace(/^Class_/, '') || `Class ${character.Class}`;
    character.OriginName = attributeMap[character.Origin] || `Origin ${character.Origin}`;
    character.alignment = getAlignment(character.PlayerType, character.PlayerSubType, character.PraetorianProgress);

    character = enrichCharacter(character);

    const { pools, ancillaries } = await getPoolsAndAncillaries(pool, dbid, null);
    character.Pools = pools;
    character.AncillaryPools = ancillaries;

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

    character.SupergroupLink = await resolveSupergroupLink(pool, character.SupergroupsId);
    character.globalHandle = await getGlobalHandle(character.AuthId);

    const badgeCategoryList = Object.values(badgeCategories).sort((a, b) => a.name.localeCompare(b.name));

    res.render('character', {
      title: `Character: ${character.Name}`,
      character,
      serverKey,
      badgeCategoryList,
      totalBadges,
      ownedBadges,
      unearnedBadgeCategories,
      message: forcedAccess ? "This is a private character. Displaying because you are an admin." : null,
      stringClean
    });

  } catch (err) {
    console.error(err);
    res.status(500).send('Server error loading character.');
  }
}

module.exports = {
  showCharacter
};
