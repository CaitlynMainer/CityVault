const { checkForUpdates } = require(global.BASE_DIR + '/services/updateChecker');
const getAdminRoutes = require(global.BASE_DIR + '/services/getAdminRoutes'); // updated path from utils to services

async function showDashboard(req, res) {
  let updateInfo = null;

  try {
    updateInfo = await checkForUpdates();
  } catch (err) {
    console.warn('[Admin] Failed to check for updates:', err.message);
  }

  const links = getAdminRoutes(); // <- fetch the dynamic admin route list

  res.render('admin/dashboard', {
    user: req.session?.user || { username: req.session?.username },
    updateInfo,
    links // <- pass to EJS template
  });
}

module.exports = {
  showDashboard
};
