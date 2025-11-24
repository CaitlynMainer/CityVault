const { checkForUpdates } = require(global.BASE_DIR + '/services/updateChecker');
const getAdminRoutes = require(global.BASE_DIR + '/services/getAdminRoutes');
const { isGM, isAdmin } = require(global.BASE_DIR + '/utils/roles');

async function showDashboard(req, res) {
  const user = req.session?.user || {
    username: req.session?.username,
    role: req.session?.role || 'user'
  };

  // Default "no update" object
  let updateInfo = {
    updateAvailable: false,
    currentVersion: null,
    latestVersion: null,
    version: null,
    url: null,
    zipUrl: null,
    notes: [],
    notesFlat: [],
    notesHtml: ''
  };

  if (isAdmin(user.role)) {
    try {
      const result = await checkForUpdates();
      if (result) {
        updateInfo = result;
      }
    } catch (err) {
      console.warn('[Admin] Failed to check for updates:', err.message);
    }
  }

  let links = getAdminRoutes(req.user?.role || 'user');
  links = links.filter(link => {
    const allowedRoles = link.meta?.access;
    if (!allowedRoles) return true;
    return allowedRoles.includes(user.role);
  });

  res.render('admin/dashboard', {
    user,
    links,
    updateInfo,
    update: updateInfo
  });
}

module.exports = {
  showDashboard
};
