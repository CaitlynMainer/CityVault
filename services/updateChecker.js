const https = require('https');
const fs = require('fs');
const path = require('path');

function checkForUpdates() {
  return new Promise((resolve, reject) => {
    const localVersionPath = path.join(global.BASE_DIR, 'data', 'version.json');
    let localVersion = '0.0.0';

    try {
      localVersion = JSON.parse(fs.readFileSync(localVersionPath)).version;
    } catch (e) {
      return resolve({ error: 'Could not read local version' });
    }

    https.get('https://caitlynmainer.github.io/CityVault/update.json', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const update = JSON.parse(data);
          if (update.latest !== localVersion) {
            return resolve({
              updateAvailable: true,
              currentVersion: localVersion,
              latestVersion: update.latest,
              url: update.url,
              notes: update.notes || null
            });
          } else {
            return resolve({ updateAvailable: false });
          }
        } catch (err) {
          resolve({ error: 'Failed to parse update info' });
        }
      });
    }).on('error', (err) => {
      resolve({ error: 'Failed to fetch update info' });
    });
  });
}

module.exports = { checkForUpdates };
