const https = require('https');
const fs = require('fs');
const path = require('path');
const semver = require('semver');

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            'User-Agent': 'CityVault-Updater',
            'Accept': 'application/vnd.github.v3+json'
          }
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              resolve(json);
            } catch (_err) {
              reject(new Error('Failed to parse JSON'));
            }
          });
        }
      )
      .on('error', (err) => reject(err));
  });
}

function normalizeBodyToLines(body) {
  return (body || '')
    .split('\n')
    .map((line) => line.trim().replace(/^[-–*]\s*/, '– '))
    .filter((line) => line.length > 0);
}

/**
 * Choose the best ZIP asset from a release's assets array.
 * Prefers names containing "CityVault" and ends with .zip.
 * Falls back to any .zip, and finally to the release zipball_url (source code).
 */
function pickZipUrlFromRelease(release) {
  const assets = Array.isArray(release.assets) ? release.assets : [];

  const zipAssets = assets.filter(a =>
    typeof a.name === 'string' &&
    /\.zip$/i.test(a.name) &&
    a.browser_download_url
  );

  // Prefer ones that look like actual build artifacts
  let best = zipAssets.find(a => /cityvault/i.test(a.name)) || zipAssets[0];

  if (best && best.browser_download_url) {
    return best.browser_download_url;
  }

  // Fallback: GitHub's auto-generated source zip for the tag
  if (release.zipball_url) {
    return release.zipball_url;
  }

  return null;
}

function linesToHtml(lines, cap = 6, moreUrl = null) {
  const html = lines
    .slice(0, cap)
    .map((l) => escapeHTML(l))
    .join('<br>');
  const extra =
    moreUrl && lines.length > cap
      ? `<br><a href="${escapeHTML(moreUrl)}" target="_blank" rel="noopener">...see full changelog</a>`
      : '';
  return html + extra;
}

async function getLocalVersion() {
  const localVersionPath = path.join(global.BASE_DIR, 'version.json');
  const json = JSON.parse(fs.readFileSync(localVersionPath, 'utf8'));
  return String(json.version);
}

/**
 * Map GitHub releases -> notes entries your EJS expects,
 * with an added zipUrl on each note.
 */
function mapReleasesToNotes(releases) {
  return releases.map((r) => ({
    version: r.tag,                                  // "X.Y.Z"
    name: r.name || `v${r.tag}`,
    url: r.html_url || null,                         // release page
    zipUrl: pickZipUrlFromRelease(r),                // <- direct ZIP url
    lines: normalizeBodyToLines(r.body || '')
  }));
}

async function getGithubNewerReleases(localVersion) {
  const releases = await fetchJSON('https://api.github.com/repos/CaitlynMainer/CityVault/releases');

  const cleaned = releases
    .map((r) => ({
      tag: r.tag_name ? r.tag_name.replace(/^v/, '') : null,
      html_url: r.html_url,
      name: r.name || r.tag_name,
      body: r.body || '',
      prerelease: !!r.prerelease,
      draft: !!r.draft,
      assets: r.assets || [],
      zipball_url: r.zipball_url || null
    }))
    .filter((r) => semver.valid(r.tag))
    .filter((r) => !r.prerelease && !r.draft);

  const newer = cleaned
    .filter((r) => semver.gt(r.tag, localVersion))
    .sort((a, b) => semver.compare(a.tag, b.tag)); // ascending

  if (newer.length === 0) return null;

  const latest = newer.at(-1);
  const latestZip = pickZipUrlFromRelease(latest);

  return {
    latestVersion: latest.tag,
    latestUrl: latest.html_url,
    latestZipUrl: latestZip || null,
    notesReleases: mapReleasesToNotes(newer)
  };
}

async function getFallbackFromUpdateJson(localVersion) {
  try {
    const update = await fetchJSON('https://caitlynmainer.github.io/CityVault/update.json');
    const latestVersion = String(update.latest || '').replace(/^v/, '');
    if (!latestVersion || !semver.valid(latestVersion) || !semver.gt(latestVersion, localVersion)) {
      return null;
    }

    // Try to fetch the tagged release for notes + assets
    let releaseData = null;
    try {
      releaseData = await fetchJSON(
        `https://api.github.com/repos/CaitlynMainer/CityVault/releases/tags/v${latestVersion}`
      );
    } catch {
      // ignore
    }

    // Build a minimal "release object" for picker
    const simulatedRelease = releaseData
      ? {
          tag: latestVersion,
          html_url: releaseData.html_url || update.url || null,
          name: releaseData.name || releaseData.tag_name || `v${latestVersion}`,
          body: releaseData.body || '',
          assets: releaseData.assets || [],
          zipball_url: releaseData.zipball_url || null
        }
      : {
          tag: latestVersion,
          html_url: update.url || null,
          name: `v${latestVersion}`,
          body: '',
          assets: [],
          zipball_url: null
        };

    const latestZip = pickZipUrlFromRelease(simulatedRelease);

    const notesReleases = [
      {
        version: simulatedRelease.tag,
        name: simulatedRelease.name,
        url: simulatedRelease.html_url,
        zipUrl: latestZip,
        lines: normalizeBodyToLines(simulatedRelease.body || '')
      }
    ];

    return {
      latestVersion,
      latestUrl: simulatedRelease.html_url,
      latestZipUrl: latestZip || null,
      notesReleases
    };
  } catch {
    return null;
  }
}

async function checkForUpdates() {
  const currentVersion = await getLocalVersion();

  try {
    // PRIMARY: GitHub
    const gh = await getGithubNewerReleases(currentVersion);

    if (gh) {
      const latestNote = gh.notesReleases.at(-1);
      const notesFlat = gh.notesReleases.flatMap((r) => r.lines);
      const notesHtml = linesToHtml(latestNote?.lines || [], 6, gh.latestUrl);

      return {
        updateAvailable: true,
        currentVersion,
        latestVersion: gh.latestVersion,
        version: gh.latestVersion,        // convenience
        url: gh.latestUrl,                // release page
        zipUrl: gh.latestZipUrl,          // <- DIRECT ZIP URL (preferred)
        notes: gh.notesReleases,          // [{version,name,url,zipUrl,lines}]
        notesFlat,
        notesHtml
      };
    }

    // FALLBACK: static update.json
    const fb = await getFallbackFromUpdateJson(currentVersion);
    if (fb) {
      const latestNote = fb.notesReleases.at(-1);
      const notesFlat = fb.notesReleases.flatMap((r) => r.lines);
      const notesHtml = linesToHtml(latestNote?.lines || [], 6, fb.latestUrl);

      return {
        updateAvailable: true,
        currentVersion,
        latestVersion: fb.latestVersion,
        version: fb.latestVersion,
        url: fb.latestUrl,
        zipUrl: fb.latestZipUrl,          // <- DIRECT ZIP URL if we could find one
        notes: fb.notesReleases,
        notesFlat,
        notesHtml
      };
    }

    // No updates
    return {
      updateAvailable: false,
      currentVersion,
      latestVersion: currentVersion,
      version: currentVersion,
      url: null,
      zipUrl: null,
      notes: [],
      notesFlat: [],
      notesHtml: ''
    };
  } catch (err) {
    console.warn('[UPDATE] Failed to check for updates:', err.message);

    // Try fallback before giving up
    const fb = await getFallbackFromUpdateJson(currentVersion);
    if (fb) {
      const latestNote = fb.notesReleases.at(-1);
      const notesFlat = fb.notesReleases.flatMap((r) => r.lines);
      const notesHtml = linesToHtml(latestNote?.lines || [], 6, fb.latestUrl);

      return {
        updateAvailable: true,
        currentVersion,
        latestVersion: fb.latestVersion,
        version: fb.latestVersion,
        url: fb.latestUrl,
        zipUrl: fb.latestZipUrl,
        notes: fb.notesReleases,
        notesFlat,
        notesHtml
      };
    }

    // Final error path
    return {
      updateAvailable: false,
      currentVersion: 'unknown',
      latestVersion: 'unknown',
      version: 'unknown',
      url: null,
      zipUrl: null,
      notes: [],
      notesFlat: [],
      notesHtml: '',
      error: err.message
    };
  }
}

module.exports = { checkForUpdates };
