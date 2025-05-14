const https = require('https');
const fs = require('fs');
const path = require('path');

function escapeHTML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'CityVault-Updater' } }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(json);
          } catch (err) {
            reject(new Error('Failed to parse JSON'));
          }
        });
      })
      .on('error', (err) => reject(err));
  });
}

async function checkForUpdates() {
  const localVersionPath = path.join(global.BASE_DIR, 'data', 'version.json');
  const localVersion = JSON.parse(fs.readFileSync(localVersionPath)).version;

  try {
    const update = await fetchJSON('https://caitlynmainer.github.io/CityVault/update.json');
    const latestVersion = update.latest;

    if (latestVersion !== localVersion) {
      const releaseData = await fetchJSON(
        `https://api.github.com/repos/CaitlynMainer/CityVault/releases/tags/v${latestVersion}`
      );

      const fullNotes = (releaseData.body || '').trim();
      const lines = fullNotes
        .split('\n')
        .map(line => line.trim().replace(/^[-–]\s*/, '– ')) // Normalize bullet
        .filter(line => line.length > 0);

      const displayNotes = lines
        .slice(0, 6)
        .map(line => escapeHTML(line))
        .join('<br>');

      const extra =
        lines.length > 6
          ? `<br><a href="https://github.com/CaitlynMainer/CityVault/releases/tag/v${latestVersion}" target="_blank">...see full changelog</a>`
          : '';

      return {
        updateAvailable: true,
        currentVersion: localVersion,
        latestVersion,
        url: update.url,
        notes: displayNotes + extra
      };
    }

    return {
      updateAvailable: false,
      currentVersion: localVersion,
      latestVersion: localVersion
    };
  } catch (err) {
    console.warn('[UPDATE] Failed to check for updates:', err.message);
    return {
      updateAvailable: false,
      currentVersion: 'unknown',
      latestVersion: 'unknown',
      error: err.message
    };
  }
}

module.exports = { checkForUpdates };
