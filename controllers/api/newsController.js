const path = require('path');
const fs = require('fs');

const newsPath = path.join(global.BASE_DIR, 'data/news.json');

function getNews(req, res) {
  try {
    if (!fs.existsSync(newsPath)) {
      return res.status(404).json({ error: 'News file not found' });
    }

    const raw = fs.readFileSync(newsPath, 'utf8');
    const news = JSON.parse(raw);

    const sorted = news.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.date) - new Date(a.date);
    });

    res.json(sorted);
  } catch (err) {
    console.error('[NEWS API ERROR]', err);
    res.status(500).json({ error: 'Failed to load news' });
  }
}

module.exports = {
  getNews
};
