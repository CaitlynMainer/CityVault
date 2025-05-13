// services/homeWidgets.js (optimized)
const sql = require('mssql');
const fs = require('fs');
const path = require('path');
const config = require(global.BASE_DIR + '/utils/config');
const { getGamePool, getChatPool } = require(global.BASE_DIR + '/db');
const { getGlobalHandle } = require('../utils/characterInfo/getGlobalHandle');
const { getOwnedBadgesFromBitfield } = require('../utils/badgeParser');
const attributeMap = require(global.BASE_DIR + '/utils/attributeMap');

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
    const result = await pool.request().query(`
      SELECT TOP 9 e.ContainerId, e.AuthId, e.Name, e.Origin, e.Class, e.Level, e.LastActive
      FROM dbo.Ents e
      WHERE (e.AccessLevel IS NULL OR e.AccessLevel = 0)
      AND e.Active IS NULL
      ORDER BY e.LastActive DESC
    `);
    combined.push(...result.recordset.map(row => ({ ...row, serverKey })));
  }

  const authIds = [...new Set(combined.map(row => row.AuthId))];
  await batchGetGlobalHandles(authIds);

  // Deduplicate by AuthId, Name, and serverKey
  const seen = new Set();
  const unique = combined.filter(row => {
    const key = `${row.AuthId}:${row.Name}:${row.serverKey}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });


  const mapped = unique.map(row => {
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


  const sorted = mapped.sort((a, b) => new Date(b.LastActive) - new Date(a.LastActive));
  const final = sorted.slice(0, 9);

  return final;
}



async function getCharacterBirthdays() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const combined = [];

  for (const serverKey of Object.keys(config.servers)) {
    const pool = await getGamePool(serverKey);
    const result = await pool.request()
      .input('month', sql.Int, month)
      .input('day', sql.Int, day)
      .query(`
        SELECT TOP 6 e.ContainerId, e.AuthId, e.Name, e.Origin, e.Class, e.Level, e.DateCreated, e.LastActive
        FROM dbo.Ents e
        WHERE DATEPART(mm, e.DateCreated) = @month AND DATEPART(dd, e.DateCreated) = @day
          AND e.Level > 9 AND e.AccessLevel IS NULL
        ORDER BY e.LastActive DESC
      `);
    combined.push(...result.recordset.map(row => ({ ...row, serverKey })));
  }

  const authIds = [...new Set(combined.map(row => row.AuthId))];
  await batchGetGlobalHandles(authIds);

  return combined.map(row => {
    const ClassName = attributeMap[row.Class]?.replace(/^Class_/, '') || `Class ${row.Class}`;
    const OriginName = attributeMap[row.Origin] || `Origin ${row.Origin}`;
    return {
      ...row,
      Level: row.Level + 1,
      Archetype: ClassName,
      OriginName,
      GlobalName: globalHandleCache.get(row.AuthId)
    };
  }).sort((a, b) => new Date(b.LastActive) - new Date(a.LastActive)).slice(0, 6);
}


async function getQuickStats() {
  const combined = [];

  for (const serverKey of Object.keys(config.servers)) {
    const pool = await getGamePool(serverKey);
    const result = await pool.request().query(`
      SELECT e.Origin, e.Class, e.Level, e.InfluencePoints, e.LastActive
      FROM dbo.Ents e
      WHERE e.AccessLevel IS NULL
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
    onlineMonth: 0
  };

  let levelSum = 0, infSum = 0;
  const now = new Date();

  combined.forEach(row => {
    const level = row.Level + 1;
    levelSum += level;
    infSum += parseInt(row.InfluencePoints || 0);

    stats.archetypeCounts[row.Class] = (stats.archetypeCounts[row.Class] || 0) + 1;
    stats.originCounts[row.Origin] = (stats.originCounts[row.Origin] || 0) + 1;

    const lastActive = new Date(row.LastActive);
    if (lastActive.toDateString() === now.toDateString()) stats.onlineToday++;
    if (lastActive.getMonth() === now.getMonth() && lastActive.getFullYear() === now.getFullYear()) stats.onlineMonth++;
  });

  stats.avgLevel = combined.length ? +(levelSum / combined.length).toFixed(1) : 0;
  stats.avgInfluence = combined.length ? +(infSum / combined.length).toFixed(0) : 0;

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
    const result = await pool.request().query(`
      SELECT e.ContainerId, e.AuthId, e.Name, e.Origin, e.Class, e.Level, e.LastActive, b.Owned
      FROM dbo.Ents e
      JOIN dbo.Badges b ON e.ContainerId = b.ContainerId
      WHERE e.AccessLevel IS NULL AND b.Owned IS NOT NULL
    `);
    combined.push(...result.recordset.map(row => ({ ...row, serverKey })));
  }

  const eligible = [];
  const authIds = [];

  for (const row of combined) {
    const owned = row.Owned?.toString('hex') || '';
    const badges = getOwnedBadgesFromBitfield(owned);
    if (badges.length >= 500) {
      authIds.push(row.AuthId);
      eligible.push({ ...row, badgeCount: badges.length });
    }
  }

  await batchGetGlobalHandles(authIds);

  const final = eligible.map(row => {
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
