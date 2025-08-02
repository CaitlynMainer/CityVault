const path = require('path');
const fs = require('fs');

exports.showStats = async function (req, res) {
    const statsPath = path.join(global.BASE_DIR, 'data', 'cache.dat');
    let statsByServer = {};
    let combinedStats = {};
    let selectedKey = req.query.server || 'combined';

    try {
        statsByServer = JSON.parse(fs.readFileSync(statsPath, 'utf8'));

        // Build combined stats
        const allKeys = Object.keys(statsByServer);
        combinedStats = allKeys.reduce((acc, key) => {
            const serverData = statsByServer[key];
            for (const [k, v] of Object.entries(serverData)) {
                if (typeof v === 'number') {
                    acc[k] = (acc[k] || 0) + v;
                } else if (typeof v === 'object' && v !== null) {
                    acc[k] = acc[k] || {};
                    for (const [subKey, subVal] of Object.entries(v)) {
                        acc[k][subKey] = (acc[k][subKey] || 0) + subVal;
                    }
                }
            }
            return acc;
        }, {});
    } catch (err) {
        console.error('[Stats] Failed to read or parse cache.dat:', err);
    }

    const chars =
        selectedKey === 'combined'
            ? combinedStats
            : statsByServer[selectedKey] || {};

    // Normalize pools across ATs
    if (chars.pools) {
        const normalizedPools = {};
        for (const [key, count] of Object.entries(chars.pools)) {
            const poolName = key.replace(/^class_[^:]+:/, '');
            normalizedPools[poolName] = (normalizedPools[poolName] || 0) + count;
        }
        chars.pools = normalizedPools;
    }

    // Clamp and round Hero/Villain level stats
    ['hero', 'villain'].forEach(type => {
        const count = chars[`${type}_count`] || 0;
        if (count > 0) {
            chars[`${type}_avg_lvl`] = Math.round(chars[`${type}_avg_lvl`] || 0);
        } else {
            chars[`${type}_avg_lvl`] = 0;
        }

        chars[`${type}_highest_lvl`] = Math.min(50, chars[`${type}_highest_lvl`] || 0);
        chars[`${type}_lowest_lvl`] = Math.min(50, Math.max(1, chars[`${type}_lowest_lvl`] || 0));
    });

    // Fix combined general_* stats
    if (selectedKey === 'combined') {
        const totalHero = combinedStats.hero_count || 0;
        const totalVillain = combinedStats.villain_count || 0;
        const totalCombined = totalHero + totalVillain;

        const heroSum = (combinedStats.hero_avg_lvl || 0) * totalHero;
        const villainSum = (combinedStats.villain_avg_lvl || 0) * totalVillain;

        combinedStats.general_avg_lvl = totalCombined > 0
            ? Math.round((heroSum + villainSum) / totalCombined)
            : 0;

        combinedStats.general_highest_lvl = Math.min(
            50,
            Math.max(
                combinedStats.hero_highest_lvl || 0,
                combinedStats.villain_highest_lvl || 0
            )
        );

        combinedStats.general_lowest_lvl = Math.min(
            Math.max(1, combinedStats.hero_lowest_lvl ?? Infinity),
            Math.max(1, combinedStats.villain_lowest_lvl ?? Infinity)
        );
    }

    res.render('stats', {
        title: 'General Character Statistics - City Vault',
        chars,
        serverOptions: ['combined', ...Object.keys(statsByServer)],
        selectedKey
    });
};
