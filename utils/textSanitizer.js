const escapeHtml = require('escape-html');

function stringClean(input) {
  if (!input || typeof input !== 'string') return '';

  // Step 1: Escape for HTML display
  let out = escapeHtml(input);

  // Step 2: CoH custom escape codes
  out = input.replace(/\\s/g, "'")
                 .replace(/\\d/g, '$')
                 .replace(/\\p/g, '%')
                 .replace(/\\q/g, '"');

  // Step 3: Render escaped \n or \r\n as HTML <br>
  return out.replace(/\\r\\n|\\n/g, '<br>');
}

module.exports = { stringClean };
