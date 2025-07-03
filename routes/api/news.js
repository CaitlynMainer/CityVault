const express = require('express');
const router = express.Router();

const loadController = require(global.BASE_DIR + '/utils/loadController');
const { getNews } = loadController('api/newsController');

router.get('/news.json', getNews);

module.exports = router;