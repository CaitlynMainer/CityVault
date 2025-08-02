const { getGamePool } = require(global.BASE_DIR + '/db');

const attributeCache = {};
const reverseAttributeCache = {};
const loadLocks = {}; // prevent concurrent loads

let cacheHits = 0;
let cacheMisses = 0;

async function loadAttributeMapFromDB(serverKey) {
  cacheMisses++;
  console.debug(`[AttributeMap] Cache MISS for ${serverKey} — loading from DB`);

  const map = {};
  const reverseMap = {};

  try {
    const pool = await getGamePool(serverKey);
    const result = await pool.request().query(`SELECT Id, Name FROM dbo.Attributes`);

    for (const row of result.recordset) {
      map[row.Id] = row.Name;
      reverseMap[row.Name.toLowerCase()] = row.Id;
    }

    console.debug(`[AttributeMap] Loaded ${result.recordset.length} attributes for ${serverKey}`);
    attributeCache[serverKey] = map;
    reverseAttributeCache[serverKey] = reverseMap;
  } catch (err) {
    console.error(`[ERROR] Failed to load attribute map for ${serverKey}:`, err);
    throw err;
  }

  return map;
}

async function getAttributeMap(serverKey) {
  const map = attributeCache[serverKey];

  // Use if valid
  if (map && Object.keys(map).length > 0) {
    cacheHits++;
    return map;
  }

  // Only load once
  if (!loadLocks[serverKey]) {
    loadLocks[serverKey] = loadAttributeMapFromDB(serverKey).finally(() => {
      delete loadLocks[serverKey];
    });
  }

  return await loadLocks[serverKey];
}


async function getAttributeIdByName(serverKey, name) {
  if (!reverseAttributeCache[serverKey]) {
    await loadAttributeMapFromDB(serverKey);
  }
  return reverseAttributeCache[serverKey]?.[name.toLowerCase()] ?? null;
}

async function preloadAttributeMaps(serverKeys) {
  const unique = [...new Set(serverKeys)];
  await Promise.all(unique.map(loadAttributeMapFromDB));
}

// For diagnostics/reporting
function getAttributeMapCacheStats() {
  return {
    serverKeys: Object.keys(attributeCache),
    totalCached: Object.keys(attributeCache).length,
    cacheHits,
    cacheMisses,
    perServerCount: Object.fromEntries(
      Object.entries(attributeCache).map(([serverKey, map]) => [serverKey, Object.keys(map).length])
    )
  };
}

module.exports = {
  getAttributeMap,
  getAttributeIdByName,
  preloadAttributeMaps,
  getAttributeMapCacheStats
};
