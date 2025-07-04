const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');
const { default: pLimit } = require('p-limit');

async function fetchParsedManifest(manifestUrl) {
  try {
    const xml = await axios.get(manifestUrl).then(r => r.data);
    const parser = new XMLParser({ ignoreAttributes: false });
    return parser.parse(xml);
  } catch (err) {
    console.error('[MANIFEST FETCH ERROR]', err.message || err);
    return null;
  }
}

function getManifestVersion(parsed) {
  return parsed?.manifest?.version || null;
}

function getManifestPoster(parsed) {
  return parsed?.manifest?.poster_image?.['@_url'] || null;
}

function getManifestLabel(parsed) {
  return parsed?.manifest?.label || null;
}

async function patchFromManifest(manifestUrl, installDir, onProgress, onLog) {
  onLog?.('[MAIN] patchFromManifest invoked');

  try {
    const parsed = await fetchParsedManifest(manifestUrl);
    const files = parsed?.manifest?.filelist?.file;
    if (!files) {
      console.error("[PATCH ERROR] No files found in manifest.");
      return;
    }

    const filelist = Array.isArray(files) ? files : [files];
    onLog?.(`[DEBUG] Loaded manifest with ${filelist.length} file(s).`);

    const total = filelist.length;
    let completed = 0;
    const limit = pLimit(4); // 4 concurrent

    await Promise.all(filelist.map(entry => limit(async () => {
      const name = entry['@_name']?.trim();
      const expectedSize = parseInt(entry['@_size'], 10);
      const expectedMD5 = entry['@_md5']?.trim();

      let urls = Array.isArray(entry.url) ? entry.url : [entry.url];
      urls = urls.sort(() => Math.random() - 0.5);

      if (!name || isNaN(expectedSize) || !expectedMD5) {
        console.warn('[SKIP] Invalid file entry:', entry);
        onProgress?.({ type: 'overall-progress', completed: ++completed, total });
        return;
      }

      if (path.isAbsolute(name) || name.includes('..') || name.includes(':')) {
        console.warn(`[SKIP] Suspicious or absolute path: ${name}`);
        onProgress?.({ type: 'overall-progress', completed: ++completed, total });
        return;
      }

      const filePath = path.resolve(installDir, name);
      if (!filePath.startsWith(path.resolve(installDir))) {
        console.warn(`[SKIP] Unsafe path detected: ${name}`);
        onProgress?.({ type: 'overall-progress', completed: ++completed, total });
        return;
      }

      const needsDownload = await fileNeedsUpdate(filePath, expectedMD5, expectedSize);
      if (!needsDownload) {
        onLog?.(`[SKIP] ${name}`);
        onProgress?.({ type: 'overall-progress', completed: ++completed, total });
        return;
      }

      onLog?.(`[PATCH] Downloading ${name}`);
      onProgress?.({ type: 'file-start', file: name });

      let success = false;
      for (const url of urls) {
        try {
          await fs.promises.mkdir(path.dirname(filePath), { recursive: true });

          const writer = fs.createWriteStream(filePath);
          const response = await axios({ method: 'get', url, responseType: 'stream' });

          await new Promise((resolve, reject) => {
            response.data.pipe(writer);
            writer.on('finish', resolve);
            writer.on('error', reject);
          });

          const isValid = !(await fileNeedsUpdate(filePath, expectedMD5, expectedSize));
          if (isValid) {
            onLog?.(`→ [OK] ${name}`);
            success = true;
            break;
          } else {
            console.warn(`→ [INVALID MD5] ${name} from ${url}`);
          }
        } catch (err) {
          console.warn(`→ [FAIL] ${url}`);
        }
      }

      if (!success) {
        console.error(`[ERROR] Failed to patch ${name}`);
      }

      onProgress?.({ type: 'overall-progress', completed: ++completed, total });
    })));

    onLog?.('[PATCH] Complete.');
  } catch (err) {
    console.error('[PATCH ERROR]', err.message || err);
  }
}

async function fileNeedsUpdate(filePath, expectedMD5, expectedSize) {
  try {
    const stats = fs.statSync(filePath);
    if (stats.size !== expectedSize) return true;

    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);

    return await new Promise((resolve, reject) => {
      stream.on('data', chunk => hash.update(chunk));
      stream.on('end', () => {
        const digest = hash.digest('hex');
        resolve(digest.toLowerCase() !== expectedMD5.toLowerCase());
      });
      stream.on('error', reject);
    });
  } catch {
    return true;
  }
}

async function parseProfilesFromManifest(manifestUrl) {
  try {
    const parsed = await fetchParsedManifest(manifestUrl);
    const launches = [];
    const profiles = parsed?.manifest?.profiles;
    if (!profiles) return launches;

    const launchTypes = ['launch', 'devlaunch'];
    for (const type of launchTypes) {
      const entries = profiles[type];
      if (!entries) continue;

      const list = Array.isArray(entries) ? entries : [entries];
      for (const entry of list) {
        launches.push({
          name: entry['#text'] || 'Unnamed',
          exec: entry['@_exec'],
          params: entry['@_params'],
          architecture: entry['@_architecture'] || '',
        });
      }
    }

    return launches;
  } catch (err) {
    console.error('[PROFILE PARSE ERROR]', err.message || err);
    return [];
  }
}

module.exports = {
  patchFromManifest,
  parseProfilesFromManifest,
  fetchParsedManifest,
  getManifestVersion,
  getManifestPoster,
  getManifestLabel
};
