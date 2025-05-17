// Full updated characterController.js using modular characterInfo helpers with privacy check

const sql = require('mssql');
const path = require('path');
const fs = require('fs');
const { getGamePool, getAuthPool } = require(global.BASE_DIR + '/db');
const { getAttributeMap } = require(global.BASE_DIR + '/utils/attributeMap');
const { getOwnedBadgesFromBitfield } = require(global.BASE_DIR + '/utils/badgeParser');
const { getBadgeDetails, getAllBadges, getBadgeEquivalents } = require(global.BASE_DIR + '/utils/badgeDetails');
const { getAlignment } = require(global.BASE_DIR + '/utils/alignment');
const { getGlobalHandle } = require(global.BASE_DIR + '/utils/characterInfo/getGlobalHandle');
const { resolveSupergroupLink } = require(global.BASE_DIR + '/utils/characterInfo/resolveSupergroupLink');
const { enrichCharacter } = require(global.BASE_DIR + '/utils/characterInfo/formatCharacterDetails');
const { getPoolsAndAncillaries } = require(global.BASE_DIR + '/utils/characterInfo/powersetLoader');
const { stringClean } = require(global.BASE_DIR + '/utils/textSanitizer');
const multer = require('multer');
const sharp = require('sharp');

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

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Only JPG, PNG, and WebP images are allowed.'));
    }
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 }
}).single('portrait');

function resolveGenderString(text, gender) {
  if (!text || typeof text !== 'string') return text;

  // Replace {Hero.gender=male MaleText|FemaleText}
  return text.replace(/\{Hero\.gender=male\s+([^|{}]+)\|([^{}]+)\}/g, (_, male, female) => {
    if (gender === 3) return female;
    if (gender === 1 || gender === 2) return male;
    return male; // fallback
  });
}


async function uploadPortrait(req, res) {
  if (!req.session?.username) return res.status(403).send('Login required');

  upload(req, res, async (err) => {
    if (err) return res.status(400).send(`Upload error: ${err.message}`);

    const [serverKey, dbidStr] = (req.body.characterId || '').split(':');
    const dbid = parseInt(dbidStr);
    if (!serverKey || isNaN(dbid)) return res.status(400).send('Invalid character ID.');

    try {
      const pool = await getGamePool(serverKey);
      const charResult = await pool.request()
        .input('dbid', sql.Int, dbid)
        .query(`SELECT AuthId FROM dbo.Ents WHERE ContainerId = @dbid`);

      const character = charResult.recordset[0];
      if (!character) return res.status(404).send('Character not found.');

      const authPool = await getAuthPool();
      const authResult = await authPool.request()
        .input('uid', sql.Int, character.AuthId)
        .query(`SELECT account FROM dbo.user_account WHERE uid = @uid`);

      const owner = authResult.recordset[0];
      if (!owner || owner.account !== req.session.username) {
        return res.status(403).send('You do not own this character.');
      }

      const destPath = path.join(global.BASE_DIR, 'public/images/portrait', `${serverKey}_${dbid}.png`);
      await sharp(req.file.buffer)
        .resize(400, 800, { fit: 'inside', withoutEnlargement: true })
        .png({ quality: 90 })
        .toFile(destPath);

      return res.redirect(`/character/${serverKey}:${dbid}`);
    } catch (error) {
      console.error('[Portrait Upload Error]', error);
      res.status(500).send('Upload failed.');
    }
  });
}

function getVisibleBadges(allBadgeDetails, ownedBadges, alignment, gender, badgeEquivalents) {
  const visibleBadges = [];

  const ownedNames = new Set(
    ownedBadges
      .map(b => b.internalName)
      .filter(name => {
        if (!allBadgeDetails[name]) {
          console.warn(`[getVisibleBadges] Owned badge "${name}" not found in allBadgeDetails`);
          return false;
        }
        return true;
      })
  );

  const isVillainAligned = ['Villain', 'Rogue', 'Loyalist'].includes(alignment);

  for (const [name, meta] of Object.entries(allBadgeDetails)) {
    if (!meta) {
      console.warn(`[getVisibleBadges] Skipping "${name}": no meta`);
      continue;
    }

    if (!meta.DisplayTitle || meta.DisplayTitle === '.') continue;
    if (meta.Category === 'kInternal' || meta.Category === 'kNone') continue;

    const isOwned = ownedNames.has(name);
    const altName = badgeEquivalents[name];

    if (altName && !allBadgeDetails[altName]) {
      console.warn(`[getVisibleBadges] badgeEquivalents maps "${name}" to missing alt "${altName}"`);
    }

    const altOwned = altName && ownedNames.has(altName);
    if (altOwned && !isOwned) continue;

    const resolvedDisplayTitle = resolveGenderString(meta.DisplayTitle, gender);
    const resolvedVillainTitle = resolveGenderString(meta.DisplayTitleVillain || meta.DisplayTitle, gender);
    const image = isVillainAligned && meta.VillainIcon ? meta.VillainIcon : meta.Icon;



        // Alignment-specific filtering (rudimentary but effective)
    if (meta.Requires) {
      const r = meta.Requires;

      const isPrimalOnly = r.includes('praetorianprogress char> normal eq') && !r.includes('!');
      const isPraetorianOnly = r.includes('praetorianprogress char> normal eq !');

      if (isPrimalOnly && ['Resistance', 'Loyalist'].includes(alignment)) continue;
      if (isPraetorianOnly && ['Hero', 'Villain', 'Vigilante', 'Rogue'].includes(alignment)) continue;
    }


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

  const attributeMap = getAttributeMap(serverKey);

  const portraitPath = path.join(global.BASE_DIR, 'public/images/portrait', `${serverKey}_${dbid}.png`);
  let portraitVersion = 0;
  try {
    const stat = fs.statSync(portraitPath);
    portraitVersion = stat.mtimeMs;
  } catch (e) {
    // File doesn't exist, fallback stays 0
  }

  try {
    const pool = await getGamePool(serverKey);

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
    const ownedBadgeIds = getOwnedBadgesFromBitfield(badgeBitfield, serverKey);

    const allBadgeDetails = getAllBadges(serverKey);
    const badgeEquivalents = getBadgeEquivalents(serverKey);
    const visibleBadges = getVisibleBadges(allBadgeDetails, ownedBadgeIds, character.alignment, character.Gender, badgeEquivalents);
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
      viewerIsOwner: isOwner,
      stringClean,
      portraitVersion
    });

  } catch (err) {
    console.error(err);
    res.status(500).send('Server error loading character.');
  }
}

module.exports = {
  showCharacter,
  uploadPortrait
};