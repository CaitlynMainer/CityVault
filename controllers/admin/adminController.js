const { checkForUpdates } = require(global.BASE_DIR + '/services/updateChecker');

async function showDashboard(req, res) {
  let updateInfo = null;

  try {
    updateInfo = await checkForUpdates(); // returns { updateAvailable, latest, current, url, notes } or null
  } catch (err) {
    console.warn('[Admin] Failed to check for updates:', err.message);
  }

  res.render('admin/dashboard', {
    user: req.session?.user || { username: req.session?.username },
    updateInfo
  });
}

module.exports = {
  showDashboard
};
