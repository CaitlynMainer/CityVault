const path = require('path');
const fs = require('fs');

function loadController(name) {
  // name should be a path WITHOUT .js
  const userPath = path.join(global.BASE_DIR, 'userContent', 'controllers', `${name}.js`);
  const defaultPath = path.join(global.BASE_DIR, 'controllers', `${name}.js`);

  if (fs.existsSync(userPath)) {
    return require(userPath);
  } else {
    return require(defaultPath);
  }
}

module.exports = loadController;
