const fs = require('fs');
const path = require('path');
const sql = require('mssql');
const { getGamePool } = require(global.BASE_DIR + '/db');
const config = require(global.BASE_DIR + '/utils/config');
const { getAttributeIdByName, getAttributeMap, getAttributeNameById } = require(global.BASE_DIR + '/utils/attributeMap');

const CACHE_PATH = path.join(global.BASE_DIR, 'data/cache.dat');

function safeInc(obj, key) {
    obj[key] = (obj[key] || 0) + 1;
}

function average(sum, count) {
    return count > 0 ? parseFloat((sum / count).toFixed(2)) : 0;
}

async function buildStatsCache() {
    const servers = Object.keys(config.servers);
    const BATCH_SIZE = 2500;
    const POWER_BATCH_SIZE = 1000;
    const allStats = {};

    for (const serverKey of servers) {
        const classNames = await getAttributeMap(serverKey, 'Class');
        const originNames = await getAttributeMap(serverKey, 'Origin');
        const epicID = await getAttributeIdByName(serverKey, 'Epic');
        const poolID = await getAttributeIdByName(serverKey, 'Pool');
        const pool = await getGamePool(serverKey);
	  if (!pool) return res.status(400).send('Invalid server.');
        const maxAccess = Number.isInteger(config.accessLevelFilter) ? config.accessLevelFilter : 0;

        const serverStats = allStats[serverKey] = {
            hero_highest_lvl: null,
            hero_lowest_lvl: null,
            hero_avg_lvl: 0,
            hero_inf: 0,
            hero_count: 0,
            villain_highest_lvl: null,
            villain_lowest_lvl: null,
            villain_avg_lvl: 0,
            villain_inf: 0,
            villain_count: 0,
            general_highest_lvl: null,
            general_lowest_lvl: null,
            general_avg_lvl: 0,
            general_count: 0,
            vigilante_count: 0,
            rogue_count: 0,
            resistance_count: 0,
            loyalist_count: 0,
            unknown_count: 0,
            pvp_count: 0,
            prae_inf: 0,
            total_inf: 0,
            origins: {},
            classes: {},
            primaries: {},
            secondaries: {},
            ancillaries: {},
            pools: {}
        };

        const idRangeQuery = await pool.request()
            .input('maxAccess', sql.Int, maxAccess)
            .query(`
        SELECT MIN(ContainerId) AS minId, MAX(ContainerId) AS maxId
        FROM dbo.Ents
        WHERE (AccessLevel IS NULL OR AccessLevel <= @maxAccess)
      `);

        const { minId, maxId } = idRangeQuery.recordset[0];
        const roleCombos = {};

        for (let startId = minId; startId <= maxId; startId += BATCH_SIZE) {
            const endId = startId + BATCH_SIZE - 1;

            const charQuery = await pool.request()
                .input('maxAccess', sql.Int, maxAccess)
                .input('startId', sql.Int, startId)
                .input('endId', sql.Int, endId)
                .query(`
          SELECT
            e.ContainerId,
            e.Active,
            e.Name,
            e.Class,
            e.Origin,
            e.Level,
            e.PlayerType,
            e.AuthId,
            e.LastActive,
            e.InfluencePoints,
            e2.originalPrimary,
            e2.originalSecondary,
            e2.PlayerSubType,
            e2.PraetorianProgress
          FROM dbo.Ents e
          LEFT JOIN dbo.Ents2 e2 ON e.ContainerId = e2.ContainerId
          WHERE (e.AccessLevel IS NULL OR e.AccessLevel <= @maxAccess)
            AND e.ContainerId BETWEEN @startId AND @endId
          ORDER BY e.ContainerId ASC
        `);

            const characters = charQuery.recordset;
            const containerIds = characters.map(c => c.ContainerId);
            let powers = [];
            //console.log(`[${serverKey}] Processing powers for ${containerIds.length} characters`);

            for (let i = 0; i < containerIds.length; i += POWER_BATCH_SIZE) {
                const idChunk = containerIds.slice(i, i + POWER_BATCH_SIZE);
                const idsList = idChunk.map(id => `'${id}'`).join(',');

                const fitnessId = await getAttributeIdByName(serverKey, 'fitness');

                const request = pool.request();
                request.input('fitnessId', sql.Int, fitnessId);

                const powerQuery = await request.query(`
                    SELECT DISTINCT p.ContainerId, p.CategoryName, p.PowerSetName AS Name
                    FROM Powers p
                    WHERE p.ContainerId IN (${idsList})
                    AND (
                        p.CategoryName = ${epicID}
                        OR (p.CategoryName = ${poolID} AND p.PowerSetName <> @fitnessId)
                    )
                    AND p.BuildNum IS NULL
                    `);



                powers.push(...powerQuery.recordset);
                powers.push(...powerQuery.recordset);
                //console.log(`[${serverKey}] Got ${powerQuery.recordset.length} powers in chunk`);

            }

            const powersByContainer = {};
            for (const row of powers) {
                if (!powersByContainer[row.ContainerId]) powersByContainer[row.ContainerId] = [];
                powersByContainer[row.ContainerId].push(row);
            }

            for (const char of characters) {

                if (!char.originalPrimary || !char.originalSecondary) {
                    console.warn(`[SkippingStats] ${char.Name} (ContainerId: ${char.ContainerId}) — Missing Primary or Secondary`);
                    continue;
                }
                const level = char.Level + 1;
                const originId = char.Origin ?? 'undefined';
                const classId = char.Class ?? 'undefined';
                const originName = originNames[originId] || `origin_${originId}`;
                const className = classNames[classId] || `class_${classId}`;
                const primaryKey = `${className}:${char.originalPrimary || 'null'}`;
                const secondaryKey = `${className}:${char.originalSecondary || 'null'}`;

                serverStats.total_inf += char.InfluencePoints;

                safeInc(serverStats.origins, originName);
                safeInc(serverStats.classes, className);
                safeInc(serverStats.primaries, primaryKey);
                safeInc(serverStats.secondaries, secondaryKey);

                serverStats.general_count++;
                serverStats.general_avg_lvl += level;
                serverStats.general_highest_lvl = Math.max(serverStats.general_highest_lvl || 0, level);
                serverStats.general_lowest_lvl = Math.min(serverStats.general_lowest_lvl ?? level, level);

                const type = char.PlayerType;
                const subtype = char.PlayerSubType;
                const prae = char.PraetorianProgress;

                const ancils = powersByContainer[char.ContainerId] || [];
                const seenAncillaries = new Set();
                const seenPools = new Set();

                for (const p of ancils) {
                    const poolName = await getAttributeNameById(serverKey, p.Name) || `id_${p.Name}`;
                    const categoryId = Number(p.CategoryName);

                    if (categoryId === epicID) {
                        const key = `${className}:${poolName}`;
                        if (!seenAncillaries.has(key)) {
                            safeInc(serverStats.ancillaries, key);
                            seenAncillaries.add(key);
                        }
                    }

                    if (categoryId === poolID) {
                        const poolKey = `${className}:${poolName}`;
                        if (!seenPools.has(poolKey)) {
                            safeInc(serverStats.pools, poolKey);
                            seenPools.add(poolKey);
                        }
                    }
                }


                const key = `${type ?? 'null'}|${subtype ?? 'null'}|${prae ?? 'null'}`;
                roleCombos[key] = (roleCombos[key] || 0) + 1;

                if (type == null && subtype == null && (prae == null || prae === 3)) {
                    serverStats.hero_count++;
                    serverStats.hero_inf += char.InfluencePoints;
                    serverStats.hero_avg_lvl += level;
                    serverStats.hero_highest_lvl = Math.max(serverStats.hero_highest_lvl || 0, level);
                    serverStats.hero_lowest_lvl = Math.min(serverStats.hero_lowest_lvl ?? level, level);
                } else if (type === 1 && subtype == null && (prae == null || prae === 3)) {
                    serverStats.villain_count++;
                    serverStats.villain_inf += char.InfluencePoints;
                    serverStats.villain_avg_lvl += level;
                    serverStats.villain_highest_lvl = Math.max(serverStats.villain_highest_lvl || 0, level);
                    serverStats.villain_lowest_lvl = Math.min(serverStats.villain_lowest_lvl ?? level, level);
                } else if (type == null && subtype === 2) {
                    serverStats.vigilante_count++;
                    serverStats.hero_inf += char.InfluencePoints;
                    serverStats.hero_avg_lvl += level;
                    serverStats.hero_highest_lvl = Math.max(serverStats.hero_highest_lvl || 0, level);
                    serverStats.hero_lowest_lvl = Math.min(serverStats.hero_lowest_lvl ?? level, level);
                } else if (type === 1 && subtype === 2) {
                    serverStats.rogue_count++;
                    serverStats.villain_inf += char.InfluencePoints;
                    serverStats.villain_avg_lvl += level;
                    serverStats.villain_highest_lvl = Math.max(serverStats.villain_highest_lvl || 0, level);
                    serverStats.villain_lowest_lvl = Math.min(serverStats.villain_lowest_lvl ?? level, level);
                } else if (prae === 2) {
                    if (type == null) serverStats.resistance_count++;
                    else serverStats.loyalist_count++;
                    serverStats.prae_inf += char.InfluencePoints;
                } else if (prae === 6) {
                    serverStats.unknown_count++;
                } else if (prae === 7) {
                    serverStats.pvp_count++;
                }
            }
        }

        // Final per-server averages
        serverStats.hero_avg_lvl = average(serverStats.hero_avg_lvl, serverStats.hero_count + serverStats.vigilante_count);
        serverStats.villain_avg_lvl = average(serverStats.villain_avg_lvl, serverStats.villain_count + serverStats.rogue_count);
        serverStats.general_avg_lvl = average(serverStats.general_avg_lvl, serverStats.general_count);

        //console.log(`[${serverKey}] Role combinations seen:`);
        //console.table(roleCombos);
    }

    fs.writeFileSync(CACHE_PATH, JSON.stringify(allStats, null, 2));
    console.log(`[StatsCache] Wrote cache to ${CACHE_PATH}`);
}


module.exports = { buildStatsCache };
