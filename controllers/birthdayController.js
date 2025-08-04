const { getGamePool, getAuthPool } = require(global.BASE_DIR + '/db');
const config = require(global.BASE_DIR + '/data/config.json');
const { stringClean } = require(global.BASE_DIR + '/utils/textSanitizer');
const { getCharacterBirthdays } = require('../services/homeWidgets');


async function list(req, res) {
  const { entries: allBirthdays } = await getCharacterBirthdays();

  allBirthdays.forEach(char => {
    char.Name = stringClean(char.Name);
  });

  res.render('birthdays', {
    title: 'Character Birthdays',
    allBirthdays
  });
}

module.exports = { list };

module.exports = { list };
