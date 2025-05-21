const fs = require('fs');
const path = require('path');

const routesDir = path.join(global.BASE_DIR, 'routes', 'admin');

function getAdminRoutes(userRole) {
  const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));
  const routes = [];

  for (const file of files) {
    if (file === 'index.js' || file === 'dashboard.js') continue;

    const base = '/' + file.replace(/\.js$/, '');
    const routeModule = require(path.join(routesDir, file));
    const meta = routeModule.meta || {};

    if (meta.display === false) continue;

    // ✅ Access check
    if (meta.access && !meta.access.includes(userRole)) continue;

    routes.push({
      path: `/admin${base}`,
      label: meta.label || base.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      icon: meta.icon || '🔧'
    });
  }

  return routes;
}
module.exports = getAdminRoutes;