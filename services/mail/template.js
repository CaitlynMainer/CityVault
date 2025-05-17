const path = require('path');
const ejs = require('ejs');

function renderTemplate(templateName, data) {
  const filePath = path.join(global.BASE_DIR, 'views', 'emails', `${templateName}.ejs`);
  return ejs.renderFile(filePath, data);
}

module.exports = { renderTemplate };
