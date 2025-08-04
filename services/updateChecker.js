const https = require('https');
const fs = require('fs');
const path = require('path');
const semver = require('semver');

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
  const localVersionPath = path.join(global.BASE_DIR, 'version.json');
  const localVersion = JSON.parse(fs.readFileSync(localVersionPath)).version;

  try {
    const releases = await fetchJSON(
      'https://api.github.com/repos/CaitlynMainer/CityVault/releases'
    );

    const newerReleases = releases
      .filter(release =>
        semver.valid(release.tag_name?.replace(/^v/, '')) &&
        semver.gt(release.tag_name.replace(/^v/, ''), localVersion)
      )
      .map(release => ({
        version: release.tag_name.replace(/^v/, ''),
        name: release.name || release.tag_name,
        url: release.html_url,
        lines: (release.body || '')
          .split('\n')
          .map(line => line.trim().replace(/^[-–*]\s*/, '– '))
          .filter(line => line.length > 0)
      }))
      .sort((a, b) => semver.compare(a.version, b.version)); // ascending

    if (newerReleases.length === 0) {
      return {
        updateAvailable: false,
        currentVersion: localVersion,
        latestVersion: localVersion
      };
    }

    return {
      updateAvailable: true,
      currentVersion: localVersion,
      latestVersion: newerReleases.at(-1).version,
      notes: newerReleases
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

