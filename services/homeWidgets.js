// services/homeWidgets.js (refactored for per-server attributeMap)
const sql = require('mssql');
const fs = require('fs');
const path = require('path');
const config = require(global.BASE_DIR + '/utils/config');
const { getGamePool, getChatPool, getAuthPool } = require(global.BASE_DIR + '/db');
const { getGlobalHandle } = require(global.BASE_DIR + '/utils/characterInfo/getGlobalHandle');
const { getOwnedBadgesFromBitfield } = require(global.BASE_DIR + '/utils/badgeParser');
const { getAlignment } = require(global.BASE_DIR + '/utils/alignment');
const { getAttributeMap } = require(global.BASE_DIR + '/utils/attributeMap');

const globalHandleCache = new Map();

async function batchGetGlobalHandles(authIds) {
  const uncached = authIds.filter(id => Number.isInteger(id) && !globalHandleCache.has(id));
  if (uncached.length === 0) return;

  for (const authId of uncached) {
    const global = await getGlobalHandle(authId);
    globalHandleCache.set(authId, global);
  }
}
  const maps = {};
/* Helper for Widgets: Get alignment to choose a banner image for character tiles */
function bannerClassFromAlignment(alignment = '') {
  const a = alignment.toLowerCase();
  if (['villain', 'rogue', 'pvp', ''].includes(a)) return 'tile-banner-villain';
  if (['resistance', 'loyalist'].includes(a)) return 'tile-banner-praeto';
  /* For 'hero', 'vigilante', anything else: */
  return 'tile-banner-hero';
}

async function getRecentlyOnline() {
  const combined = [];

  const authPool = await getAuthPool();
  const trackerResult = await authPool.request().query(`
    SELECT uid as AuthId FROM dbo.user_account WHERE tracker = 1
  `);
  const allowedAuthIds = new Set(trackerResult.recordset.map(row => row.AuthId));

  for (const serverKey of Object.keys(config.servers)) {
    const pool = await getGamePool(serverKey);
	  if (!pool) return res.status(400).send('Invalid server.');
    const result = await pool.request()
      .input(
        'maxAccess',
        sql.Int,
        Number.isInteger(config.accessLevelFilter) ? config.accessLevelFilter : 0
      )
      .query(`
        SELECT TOP 9 e.ContainerId, e.AuthId, e.Name, e.Origin, e.Class, e.Level, e.LastActive, 
                     e.PlayerType, en2.PlayerSubType, en2.PraetorianProgress
        FROM         dbo.Ents e
        LEFT JOIN    dbo.Ents2 en2 ON en2.ContainerId = e.ContainerId
        WHERE        (e.AccessLevel IS NULL OR e.AccessLevel <= @maxAccess)
        AND          (e.Active IS NULL OR e.Active = 0)
        ORDER BY     e.LastActive DESC
      `);

    // Apply tracker filter immediately
    const filtered = result.recordset.filter(row => allowedAuthIds.has(row.AuthId));
    combined.push(...filtered.map(row => ({ ...row, serverKey })));
  }

  const authIds = [...new Set(combined.map(row => row.AuthId))];
  await batchGetGlobalHandles(authIds);

  const seen = new Set();
  const unique = combined.filter(row => {
    const key = `${row.AuthId}:${row.Name}:${row.serverKey}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const mapped = await Promise.all(
    unique.map(async row => {
      const attributeMap = await getAttributeMap(row.serverKey);
      const ClassName = attributeMap[row.Class]?.replace(/^Class_/, '') || `Class ${row.Class}`;
      const OriginName = attributeMap[row.Origin] || `Origin ${row.Origin}`;
      const alignment = getAlignment(row.PlayerType, row.PlayerSubType, row.PraetorianProgress);

      return {
        ...row,
        Level: row.Level + 1,
        Archetype: ClassName,
        OriginName,
        GlobalName: globalHandleCache.get(row.AuthId),
        serverKey: row.serverKey,
        alignment,
        bannerClass: bannerClassFromAlignment(alignment)
      };
    })
  );


  return mapped.sort((a, b) => new Date(b.LastActive) - new Date(a.LastActive)).slice(0, 9);
}

async function getCharacterBirthdays() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const granularity = (config.quantizeBirthDate || 'day').toLowerCase(); // 'day' | 'month'

  const authPool = await getAuthPool();
  const trackerResult = await authPool.request().query(`
    SELECT uid as AuthId FROM dbo.user_account WHERE tracker = 1
  `);
  const allowedAuthIds = new Set(trackerResult.recordset.map(row => row.AuthId));

  const combined = [];

  for (const serverKey of Object.keys(config.servers)) {
    try {
      const pool = await getGamePool(serverKey);
	  if (!pool) return res.status(400).send('Invalid server.');
      const result = await pool.request()
        .input('month', sql.Int, month)
        .input(
          'maxAccess',
          sql.Int,
          Number.isInteger(config.accessLevelFilter) ? config.accessLevelFilter : 0
        )
        .query(`
          SELECT    e.ContainerId, e.AuthId, e.Name, e.Origin, e.Class, e.Level, e.DateCreated, e.LastActive, 
                    e.PlayerType, en2.PlayerSubType, en2.PraetorianProgress
          FROM      dbo.Ents e
          LEFT JOIN dbo.Ents2 en2 ON en2.ContainerId = e.ContainerId
          WHERE     DATEPART(mm, e.DateCreated) = @month
          AND       (e.AccessLevel IS NULL OR e.AccessLevel <= @maxAccess)
          ORDER BY  e.LastActive DESC
        `);

      // Apply tracker filter before pushing
      const filtered = result.recordset.filter(row => allowedAuthIds.has(row.AuthId));
      combined.push(...filtered.map(row => ({ ...row, serverKey })));
    } catch (err) {
      // console.warn(`[getCharacterBirthdays] Error querying ${serverKey}:`, err);
    }
  }

  // Filter by day if needed
  let filtered = combined;
  if (granularity === 'day') {
    filtered = combined.filter(row => new Date(row.DateCreated).getDate() === day);
  }

  // Sort: asc by day, then desc by last active
  filtered.sort((a, b) => {
    const aDay = new Date(a.DateCreated).getDate();
    const bDay = new Date(b.DateCreated).getDate();
    return aDay !== bDay ? aDay - bDay : new Date(b.LastActive) - new Date(a.LastActive);
  });

  const authIds = [...new Set(filtered.map(row => row.AuthId))];
  await batchGetGlobalHandles(authIds);

  const fullList = await Promise.all(
    filtered.map(async row => {
      const attributeMap = await getAttributeMap(row.serverKey);
      const ClassName = attributeMap[row.Class]?.replace(/^Class_/, '') || `Class ${row.Class}`;
      const OriginName = attributeMap[row.Origin] || `Origin ${row.Origin}`;
      const alignment = getAlignment(row.PlayerType, row.PlayerSubType, row.PraetorianProgress);

      return {
        ...row,
        Level: row.Level + 1,
        Archetype: ClassName,
        OriginName,
        GlobalName: globalHandleCache.get(row.AuthId),
        alignment,
        bannerClass: bannerClassFromAlignment(alignment)
      };
    })
  );


  return {
    entries: fullList,
    extraCount: Math.max(0, fullList.length - 6)
  };
}

async function getQuickStats() {
  const statsPath = path.join(global.BASE_DIR, 'data', 'cache.dat');
  let statsByServer = {};
  try {
    statsByServer = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
  } catch (err) {
    console.error('[QuickStats] Failed to read cache.dat:', err);
    return null;
  }

  const combined = Object.values(statsByServer).reduce((acc, cur) => {
    for (const [k, v] of Object.entries(cur)) {
      if (typeof v === 'number') {
        acc[k] = (acc[k] || 0) + v;
      } else if (typeof v === 'object' && v !== null) {
        acc[k] = acc[k] || {};
        for (const [subK, subV] of Object.entries(v)) {
          acc[k][subK] = (acc[k][subK] || 0) + subV;
        }
      }
    }
    return acc;
  }, {});

  const totalChars = combined.general_count || 0;
  const avgLevel = Math.round(combined.general_avg_lvl || 0);
  const avgInfluence = Math.round((combined.total_inf || 0) / (totalChars || 1));
  const hero50s = combined.hero_count ? Math.round((combined.hero_count * 0.05)) : 0; // estimated
  const villain50s = combined.villain_count ? Math.round((combined.villain_count * 0.05)) : 0; // estimated
  const archetypeCounts = combined.classes || {};
  const originCounts = combined.origins || {};

  // Live stats
  let onlineNow = 0;
  let onlineToday = 0;
  let onlineMonth = 0;
  const now = new Date();

  for (const serverKey of Object.keys(config.servers)) {
    const pool = await getGamePool(serverKey);
    if (!pool) continue;

    try {
      const result = await pool.request().query(`
        SELECT Active, LastActive FROM dbo.Ents
        WHERE (AccessLevel IS NULL OR AccessLevel <= ${Number(config.accessLevelFilter) || 0})
      `);
      for (const row of result.recordset) {
        if (row.Active) onlineNow++;
        const last = new Date(row.LastActive);
        if (!isNaN(last)) {
          if (last.toDateString() === now.toDateString()) onlineToday++;
          if (last.getMonth() === now.getMonth() && last.getFullYear() === now.getFullYear()) onlineMonth++;
        }
      }
    } catch (err) {
      console.warn(`[QuickStats] Failed to fetch live data from ${serverKey}:`, err);
    }
  }

  return {
    totalChars,
    avgLevel,
    avgInfluence,
    archetypeCounts,
    originCounts,
    hero50s,
    villain50s,
    onlineNow,
    onlineToday,
    onlineMonth
  };
}


async function getBadgeSpotlight() {
  const cachePath = path.join(global.BASE_DIR, 'data', 'badgeSpotlight.json');
  try {
    return JSON.parse(fs.readFileSync(cachePath));
  } catch (err) {
    console.warn('[BadgeSpotlight] Cache missing or invalid, regenerating...');
    try {
      await regenerateBadgeSpotlight();
      return JSON.parse(fs.readFileSync(cachePath));
    } catch (regenErr) {
      console.error('[BadgeSpotlight] Failed to regenerate cache:', regenErr);
      return [];
    }
  }
}

async function regenerateBadgeSpotlight() {
  const cachePath = path.join(global.BASE_DIR, 'data', 'badgeSpotlight.json');
  const combined = [];

  // Step 1: Get allowed AuthIds from auth server
  const authPool = await getAuthPool();
  const trackerResult = await authPool.request().query(`
    SELECT uid as AuthId FROM dbo.user_account WHERE tracker = 1
  `);
  const allowedAuthIds = new Set(trackerResult.recordset.map(row => row.AuthId));

  // Step 2: Get badge data from game databases
  for (const serverKey of Object.keys(config.servers)) {
    const pool = await getGamePool(serverKey);
	  if (!pool) return res.status(400).send('Invalid server.');
    const result = await pool
      .request()
      .input(
        'maxAccess',
        sql.Int,
        Number.isInteger(config.accessLevelFilter) ? config.accessLevelFilter : 0
      )
      .query(`
        SELECT    e.ContainerId, e.AuthId, e.Name, e.Origin, e.Class, e.Level, e.LastActive, b.Owned, 
                  e.PlayerType, en2.PlayerSubType, en2.PraetorianProgress
        FROM      dbo.Ents e
        JOIN      dbo.Badges b ON e.ContainerId = b.ContainerId
        LEFT JOIN dbo.Ents2 en2 ON en2.ContainerId = e.ContainerId
        WHERE     (e.AccessLevel IS NULL OR e.AccessLevel <= @maxAccess) AND b.Owned IS NOT NULL
      `);
    combined.push(...result.recordset.map(row => ({ ...row, serverKey })));
  }

  const eligible = [];
  const authIds = [];
  const minBadges = Number.isInteger(config.minBadges) ? config.minBadges : 500;

  let trackerFiltered = 0;
  let badgeFiltered = 0;

  for (const row of combined) {
    if (!allowedAuthIds.has(row.AuthId)) {
      trackerFiltered++;
      continue;
    }

    const owned = row.Owned?.toString('hex') || '';
    const badges = getOwnedBadgesFromBitfield(owned, row.serverKey);

    if (badges.length < minBadges) {
      badgeFiltered++;
      continue;
    }

    authIds.push(row.AuthId);
    eligible.push({ ...row, badgeCount: badges.length });
  }


  await batchGetGlobalHandles(authIds);



  const final = (
    await Promise.all(
      eligible.map(async row => {
        if (!maps[row.serverKey]) {
          maps[row.serverKey] = await getAttributeMap(row.serverKey);
        }

        const attributeMap = maps[row.serverKey];
        const ClassName = attributeMap[row.Class]?.replace(/^Class_/, '') || `Class ${row.Class}`;
        const OriginName = attributeMap[row.Origin] || `Origin ${row.Origin}`;
        const alignment = getAlignment(row.PlayerType, row.PlayerSubType, row.PraetorianProgress);

        return {
          ...row,
          Level: row.Level + 1,
          Archetype: ClassName,
          OriginName,
          GlobalName: globalHandleCache.get(row.AuthId),
          serverKey: row.serverKey,
          alignment,
          bannerClass: bannerClassFromAlignment(alignment),
          minBadges
        };
      })
    )
  ).sort(() => 0.5 - Math.random()).slice(0, 6);


  fs.writeFileSync(cachePath, JSON.stringify(final, null, 2));
}


module.exports = {
  getRecentlyOnline,
  getCharacterBirthdays,
  getQuickStats,
  getBadgeSpotlight,
  regenerateBadgeSpotlight
};