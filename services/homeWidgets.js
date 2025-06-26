// services/homeWidgets.js (refactored for per-server attributeMap)
const sql = require('mssql');
const fs = require('fs');
const path = require('path');
const config = require(global.BASE_DIR + '/utils/config');
const { getGamePool, getChatPool } = require(global.BASE_DIR + '/db');
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

async function getRecentlyOnline() {
  const combined = [];

  for (const serverKey of Object.keys(config.servers)) {
    const pool = await getGamePool(serverKey);
    const result = await pool.request()
      .input(
        'maxAccess',
        sql.Int,
        Number.isInteger(config.accessLevelFilter) ? config.accessLevelFilter : 0
      )
      .query(`
        SELECT TOP 9 e.ContainerId, e.AuthId, e.Name, e.Origin, e.Class, e.Level, e.LastActive
        FROM   dbo.Ents e
        WHERE  (e.AccessLevel IS NULL OR e.AccessLevel <= @maxAccess)
        AND    (e.Active IS NULL OR e.Active = 0)
        ORDER  BY e.LastActive DESC
    `);
    combined.push(...result.recordset.map(row => ({ ...row, serverKey })));
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

  const mapped = unique.map(row => {
    const attributeMap = getAttributeMap(row.serverKey);
    const ClassName = attributeMap[row.Class]?.replace(/^Class_/, '') || `Class ${row.Class}`;
    const OriginName = attributeMap[row.Origin] || `Origin ${row.Origin}`;

    return {
      ...row,
      Level: row.Level + 1,
      Archetype: ClassName,
      OriginName,
      GlobalName: globalHandleCache.get(row.AuthId),
      serverKey: row.serverKey
    };
  });

  return mapped.sort((a, b) => new Date(b.LastActive) - new Date(a.LastActive)).slice(0, 9);
}

async function getCharacterBirthdays() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const granularity = (config.quantizeBirthDate || 'day').toLowerCase(); // 'day' | 'month'

  //console.log(`[getCharacterBirthdays] Today is ${month}/${day}`);
  const combined = [];

  for (const serverKey of Object.keys(config.servers)) {
    try {
      const pool = await getGamePool(serverKey);
      const result = await pool.request()
        .input('month', sql.Int, month)
		    .input(
          'maxAccess',
          sql.Int,
          Number.isInteger(config.accessLevelFilter) ? config.accessLevelFilter : 0
        )
        .query(`SELECT e.ContainerId, e.AuthId, e.Name, e.Origin, e.Class, e.Level, e.DateCreated, e.LastActive
           FROM   dbo.Ents e
           WHERE  DATEPART(mm, e.DateCreated) = @month
           AND    (e.AccessLevel IS NULL OR e.AccessLevel <= @maxAccess)
           ORDER  BY e.LastActive DESC
      `);

      //console.log(`[getCharacterBirthdays] Server ${serverKey} returned ${result.recordset.length} character(s)`);

      if (result.recordset.length > 0) {
        result.recordset.forEach(row => {
          //console.log(`  ↪ ${row.Name} (Created: ${row.DateCreated?.toISOString?.().split('T')[0] || 'unknown'})`);
        });
      }

      combined.push(...result.recordset.map(row => ({ ...row, serverKey })));
    } catch (err) {
      //console.warn(`[getCharacterBirthdays] Error querying ${serverKey}:`, err);
    }
  }

  // Query returns all characters born in current month; check config setting to filter on current day
  let filtered = combined;

  if (granularity === 'day') {
    filtered = combined.filter(row => new Date(row.DateCreated).getDate() === day);
  }

  // Birth-month sort: asc by day, otherwise desc by LastActive (so no change if using day-level granularity)
  filtered.sort((a, b) => {
    const aDay = new Date(a.DateCreated).getDate();
    const bDay = new Date(b.DateCreated).getDate();
    return aDay !== bDay ? aDay - bDay : new Date(b.LastActive) - new Date(a.LastActive);
  });

  // Now use filtered instead of combined
  const authIds = [...new Set(filtered.map(row => row.AuthId))];
  await batchGetGlobalHandles(authIds);

  const fullList = filtered.map(row => {
    const attributeMap = getAttributeMap(row.serverKey);
    const ClassName = attributeMap[row.Class]?.replace(/^Class_/, '') || `Class ${row.Class}`;
    const OriginName = attributeMap[row.Origin] || `Origin ${row.Origin}`;
    return {
      ...row,
      Level: row.Level + 1,
      Archetype: ClassName,
      OriginName,
      GlobalName: globalHandleCache.get(row.AuthId)
    };
  })

  return {
    entries: fullList,
    extraCount: Math.max(0, fullList.length - 6)
  };
}


async function getQuickStats() {
  const combined = [];

  for (const serverKey of Object.keys(config.servers)) {
    const pool = await getGamePool(serverKey);
    const result = await pool.request()
      .input(
        'maxAccess',
        sql.Int,
        Number.isInteger(config.accessLevelFilter) ? config.accessLevelFilter : 0
      )
      .query(`
        SELECT e.Origin, e.Class, e.Level, e.InfluencePoints, e.LastActive,
               e.PlayerType, en2.PlayerSubType, en2.PraetorianProgress, e.Active
        FROM   dbo.Ents e
        JOIN   dbo.Ents2 en2 ON e.ContainerId = en2.ContainerId
        WHERE  (e.AccessLevel IS NULL OR e.AccessLevel <= @maxAccess)
    `);
    combined.push(...result.recordset.map(row => ({ ...row, serverKey })));
  }

  const stats = {
    totalChars: combined.length,
    avgLevel: 0,
    avgInfluence: 0,
    archetypeCounts: {},
    originCounts: {},
    onlineToday: 0,
    onlineMonth: 0,
    onlineNow: 0,
    hero50s: 0,
    villain50s: 0
  };

  let levelSum = 0, infSum = 0;
  let validLevelCount = 0, validInfCount = 0;
  const now = new Date();

  combined.forEach(row => {
    const attributeMap = getAttributeMap(row.serverKey);
    const level = Number(row.Level);
    if (!isNaN(level)) {
      levelSum += level;
      validLevelCount++;

      if (level >= 49) {
        const alignment = getAlignment(row.PlayerType, row.PlayerSubType, row.PraetorianProgress);
        if (['Hero', 'Resistance', 'Vigilante'].includes(alignment)) stats.hero50s++;
        if (['Villain', 'Loyalist', 'Rogue'].includes(alignment)) stats.villain50s++;
      }
    }

    const inf = Number(row.InfluencePoints);
    if (!isNaN(inf)) {
      infSum += inf;
      validInfCount++;
    }

    const className = attributeMap[row.Class]?.replace(/^Class_/, '') || `Class ${row.Class}`;
    const originName = attributeMap[row.Origin] || `Origin ${row.Origin}`;
    stats.archetypeCounts[className] = (stats.archetypeCounts[className] || 0) + 1;
    stats.originCounts[originName] = (stats.originCounts[originName] || 0) + 1;

    const lastActive = new Date(row.LastActive);
    if (!isNaN(lastActive)) {
      if (lastActive.toDateString() === now.toDateString()) stats.onlineToday++;
      if (lastActive.getMonth() === now.getMonth() && lastActive.getFullYear() === now.getFullYear()) {
        stats.onlineMonth++;
      }
    }

    if (row.Active !== null && row.Active !== 0) {
      stats.onlineNow++;
    }
  });

  stats.avgLevel = validLevelCount ? (levelSum / validLevelCount) : 0;
  stats.avgInfluence = validInfCount ? (infSum / validInfCount) : 0;

  return stats;
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

  for (const serverKey of Object.keys(config.servers)) {
    const pool = await getGamePool(serverKey);
    const result = await pool
      .request()
      .input(
        'maxAccess',
        sql.Int,
        Number.isInteger(config.accessLevelFilter) ? config.accessLevelFilter : 0
      )
      .query(`
        SELECT e.ContainerId, e.AuthId, e.Name, e.Origin, e.Class, e.Level, e.LastActive, b.Owned
        FROM   dbo.Ents e
        JOIN   dbo.Badges b ON e.ContainerId = b.ContainerId
        WHERE  (e.AccessLevel IS NULL OR e.AccessLevel <= @maxAccess) AND b.Owned IS NOT NULL
    `);
    combined.push(...result.recordset.map(row => ({ ...row, serverKey })));
  }

  const eligible = [];
  const authIds = [];

  for (const row of combined) {
    const owned = row.Owned?.toString('hex') || '';
    const badges = getOwnedBadgesFromBitfield(owned, row.serverKey);
    
    // Check against minBadges (configurable in Admin Dashboard)
    if (badges.length >= config.minBadges) {
      authIds.push(row.AuthId);
      eligible.push({ ...row, badgeCount: badges.length });
    }
  }

  await batchGetGlobalHandles(authIds);

  const final = eligible.map(row => {
    const attributeMap = getAttributeMap(row.serverKey);
    const ClassName = attributeMap[row.Class]?.replace(/^Class_/, '') || `Class ${row.Class}`;
    const OriginName = attributeMap[row.Origin] || `Origin ${row.Origin}`;
    return {
      ...row,
      Level: row.Level + 1,
      Archetype: ClassName,
      OriginName,
      GlobalName: globalHandleCache.get(row.AuthId),
      serverKey: row.serverKey
    };
  }).sort(() => 0.5 - Math.random()).slice(0, 6);

  fs.writeFileSync(cachePath, JSON.stringify(final, null, 2));
}

module.exports = {
  getRecentlyOnline,
  getCharacterBirthdays,
  getQuickStats,
  getBadgeSpotlight,
  regenerateBadgeSpotlight
};