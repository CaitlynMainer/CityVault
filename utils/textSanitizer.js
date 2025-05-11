const escapeHtml = require('escape-html');

function stringClean(input) {
  if (!input || typeof input !== 'string') return '';

  // Step 1: CoH custom escape codes
  let out = input.replace(/\\s/g, "'")
                 .replace(/\\d/g, '$')
                 .replace(/\\p/g, '%')
                 .replace(/\\q/g, '"');

  // Step 2: Escape for HTML display
  out = escapeHtml(out);

  // Step 3: Render escaped \n or \r\n as HTML <br>
  return out.replace(/\\r\\n|\\n/g, '<br>');
}

module.exports = { stringClean };
