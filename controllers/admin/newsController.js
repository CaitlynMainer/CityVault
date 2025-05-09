const fs = require('fs');
const path = require('path');
const newsPath = path.join(global.BASE_DIR, 'data', 'news.json');
function readNews() {
    if (!fs.existsSync(newsPath)) return [];
    try {
      const raw = fs.readFileSync(newsPath, 'utf-8');
      return JSON.parse(raw || '[]'); // fallback in case file is empty
    } catch (err) {
      console.error('[News Load Error]', err);
      return [];
    }
  }
  
  function writeNews(newsArray) {
    try {
      fs.writeFileSync(newsPath, JSON.stringify(newsArray, null, 2));
    } catch (err) {
      console.error('[News Write Error]', err);
    }
  }
  
  function showNewsEditor(req, res) {
    const news = readNews();
    // Sort: pinned first, then newest first
    news.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.date) - new Date(a.date);
    });
    const postId = req.query.edit;
    const post = news.find(n => n.id === postId) || { id: '', title: '', content: '', pinned: false };
    res.render('admin/news/index', { title: 'News Editor', news, post });
}

  
  function saveNews(req, res) {
    const news = readNews();
    const { id, title, content } = req.body;
  
    // HTML checkboxes only send a value if checked — typically "on"
    const pinned = req.body.pinned === 'on';
    const date = new Date().toISOString(); // includes full UTC timestamp
  
    if (id) {
      const index = news.findIndex(n => n.id === id);
      if (index !== -1) {
        news[index] = { id, title, content, pinned, date };
      }
    } else {
      const newId = Date.now().toString();
      news.push({ id: newId, title, content, pinned, date });
    }
  
    writeNews(news);
    res.redirect('/admin/news');
  }
  
  function deleteNews(req, res) {
    let news = readNews();
    news = news.filter(n => n.id !== req.body.id);
    writeNews(news);
    res.redirect('/admin/news');
  }
  
  function reorderNews(req, res) {
    const order = req.body.order;
    const news = readNews();
    const idToNews = Object.fromEntries(news.map(n => [n.id, n]));
    const reordered = order.map(id => idToNews[id]).filter(Boolean);
    writeNews(reordered);
    res.sendStatus(200);
  }
  
  module.exports = {
    showNewsEditor,
    saveNews,
    deleteNews,
    reorderNews
  };
