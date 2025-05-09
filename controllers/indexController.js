const fs = require('fs');
const path = require('path');

const newsPath = path.join(global.BASE_DIR, 'data', 'news.json');

function showHomePage(req, res) {
  let news = [];
  if (fs.existsSync(newsPath)) {
    try {
      news = JSON.parse(fs.readFileSync(newsPath));
      // Sort pinned first, then by most recent date
      news.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.date) - new Date(a.date);
      });
    } catch (err) {
      console.error('[News Load Error]', err);
    }
  }

  res.render('index', { news });
}

module.exports = {
  showHomePage
};
