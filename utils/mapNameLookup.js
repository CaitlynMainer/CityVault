const path = require('path');
const data = require(path.join(global.BASE_DIR, 'data/map_key_lookup.json'));

// Convert array to map
const lookup = {};
for (const entry of data) {
  lookup[entry.MapName.toLowerCase()] = entry;
}

module.exports = lookup;
