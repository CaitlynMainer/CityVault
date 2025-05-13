const fs = require('fs');
const path = require('path');
const config = require(global.BASE_DIR + '/utils/config');
const { getGamePool } = require(global.BASE_DIR + '/db');
const { stringClean } = require(global.BASE_DIR + '/utils/textSanitizer');

const {
  getRecentlyOnline,
  getCharacterBirthdays,
  getQuickStats,
  getBadgeSpotlight
} = require('../services/homeWidgets');

const newsPath = path.join(global.BASE_DIR, 'data', 'news.json');

async function showHomePage(req, res) {
  let news = [];
  if (fs.existsSync(newsPath)) {
    try {
      news = JSON.parse(fs.readFileSync(newsPath));
      news.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.date) - new Date(a.date);
      });
    } catch (err) {
      console.error('[News Load Error]', err);
    }
  }

  const statsCombined = {
    totalChars: 0,
    avgLevel: 0,
    avgInfluence: 0,
    archetypeCounts: {},
    originCounts: {},
    onlineToday: 0,
    onlineMonth: 0
  };

  try {
    // ✅ Call once — these internally loop over config.servers
    const [recent, birthdays, badgeSpotlight] = await Promise.all([
      getRecentlyOnline(),
      getCharacterBirthdays(),
      getBadgeSpotlight()
    ]);

    // ✅ Only getQuickStats needs per-server pool access
    for (const serverKey of Object.keys(config.servers)) {
      const pool = await getGamePool(serverKey);
      const srvStats = await getQuickStats(pool);

      statsCombined.totalChars += srvStats.total || srvStats.count || 0;
      statsCombined.avgLevel += srvStats.avgLevel * (srvStats.count || 1);
      statsCombined.avgInfluence += srvStats.avgInfluence * (srvStats.count || 1);
      statsCombined.onlineToday += srvStats.onlineToday;
      statsCombined.onlineMonth += srvStats.onlineMonth;

      for (const [atk, count] of Object.entries(srvStats.archetypeCounts)) {
        statsCombined.archetypeCounts[atk] = (statsCombined.archetypeCounts[atk] || 0) + count;
      }

      for (const [origin, count] of Object.entries(srvStats.originCounts)) {
        statsCombined.originCounts[origin] = (statsCombined.originCounts[origin] || 0) + count;
      }
    }

    // Final averages
    const total = statsCombined.totalChars;
    statsCombined.avgLevel = total ? +(statsCombined.avgLevel / total).toFixed(1) : 0;
    statsCombined.avgInfluence = total ? +(statsCombined.avgInfluence / total).toFixed(0) : 0;

    // Limit + sort
    recent.sort((a, b) => new Date(b.LastActive) - new Date(a.LastActive));
    birthdays.sort((a, b) => new Date(b.DateCreated) - new Date(a.DateCreated));
    badgeSpotlight.sort(() => 0.5 - Math.random());

    res.render('index', {
      news,
      recent: recent.slice(0, 9),
      birthdays: birthdays.slice(0, 6),
      stats: statsCombined,
      badgeSpotlight: badgeSpotlight.slice(0, 6),
      stringClean
    });

  } catch (err) {
    console.error('[Homepage Widget Error]', err);
    res.render('index', { news, recent: [], birthdays: [], stats: {}, badgeSpotlight: [] });
  }
}


module.exports = {
  showHomePage
};
