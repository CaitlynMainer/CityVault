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
    const [recent, birthdayData, badgeSpotlight] = await Promise.all([
      getRecentlyOnline(),
      getCharacterBirthdays(),
      getBadgeSpotlight()
    ]);

    const birthdays = birthdayData.entries;
    const moreBirthdays = birthdayData.extraCount;
    const allBirthdays = birthdayData.entries;

    const statsCombined = await getQuickStats();

    // Limit + sort
    recent.sort((a, b) => new Date(b.LastActive) - new Date(a.LastActive));
    birthdays.sort((a, b) => new Date(b.DateCreated) - new Date(a.DateCreated));
    badgeSpotlight.sort(() => 0.5 - Math.random());

    res.render('index', {
      news,
      recent: recent.slice(0, 9),
      birthdays: birthdays.slice(0, 6),
      allBirthdays,
      moreBirthdays, // 👈 add this
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
