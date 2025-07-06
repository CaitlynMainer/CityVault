const fs = require('fs-extra');
const path = require('path');
const AdmZip = require('adm-zip');

const launcherDir = path.join(__dirname, '../launcher_downloads');
const publicDir = path.join(__dirname, '../public/launcher');
const logPath = path.join(publicDir, 'launcher-inject.log');

// Basic log helper
function log(...args) {
  const line = args.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
  fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${line}\n`);
  console.log(...args);
}
function error(...args) {
  const line = args.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
  fs.appendFileSync(logPath, `[${new Date().toISOString()}] ERROR: ${line}\n`);
  console.error(...args);
}

function sanitizeSiteName(input) {
  return input
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .substring(0, 32);
}

async function renameExecutableTemporarily(sourceDir, platform, siteName) {
  const expectedName = `${siteName}-launcher${platform === 'win' ? '.exe' : ''}`;

  const entries = await fs.readdir(sourceDir);
  const matching = entries.find(name =>
    /^.*-launcher(\.exe)?$/.test(name)
  );

  if (!matching) {
    log(`[ZIP] ⚠ No launcher executable found in ${sourceDir}`);
    return null;
  }

  const currentPath = path.join(sourceDir, matching);
  const expectedPath = path.join(sourceDir, expectedName);

  if (matching !== expectedName) {
    await fs.rename(currentPath, expectedPath);
    log(`[ZIP] Renamed ${matching} → ${expectedName}`);
    return { renamed: true, oldPath: currentPath, newPath: expectedPath };
  } else {
    log(`[ZIP] Executable already correctly named: ${expectedName}`);
    return { renamed: false, newPath: expectedPath };
  }
}

async function zipLauncher(platformFolder, newConfig, siteName) {
  const sourceDir = path.join(launcherDir, platformFolder);
  const platform = platformFolder.split('-').pop(); // "win" or "linux"
  const outputZip = path.join(publicDir, `${siteName}-${platform}.zip`);
  const launcherName = `${siteName}-launcher`;

  log(`\n[ZIP] === Zipping for ${platform} ===`);
  log(`[ZIP] Source folder: ${sourceDir}`);
  log(`[ZIP] Output zip: ${outputZip}`);

  if (!fs.existsSync(sourceDir)) {
    log(`[ZIP] ❌ Source folder not found: ${sourceDir}`);
    return;
  }

  const result = await renameExecutableTemporarily(sourceDir, platform, siteName);
  if (!result) {
    log(`[ZIP] ❌ Executable rename failed.`);
    return;
  }

  const configPath = path.join(sourceDir, 'config.json');
  log(`[ZIP] Writing updated config to: ${configPath}`);
  await fs.writeFile(configPath, JSON.stringify(newConfig, null, 2));

  const zip = new AdmZip();
  zip.addLocalFolder(sourceDir, launcherName);
  zip.writeZip(outputZip);

  log(`[ZIP] ✅ Created ZIP: ${outputZip}`);

  if (result.renamed) {
    await fs.rename(result.newPath, result.oldPath);
    log(`[ZIP] Restored original name: ${path.basename(result.oldPath)}`);
  }
}

module.exports = async function injectAndPublish() {
  try {
    await fs.ensureDir(publicDir);
    fs.writeFileSync(logPath, ''); // clear previous log

    log('[INJECT] Reading manifest config...');
    const manifestConfig = JSON.parse(await fs.readFile(path.join(__dirname, '../data/manifest-config.json'), 'utf8'));
    const domain = manifestConfig.webpage?.replace(/\/+$/, '');

    log('[INJECT] Reading site config...');
    const siteConfig = JSON.parse(await fs.readFile(path.join(__dirname, '../data/config.json'), 'utf8'));
    const rawSiteName = siteConfig.siteName || 'vault';
    const siteName = sanitizeSiteName(rawSiteName);

    log(`[INJECT] Using siteName: "${siteName}" (raw: "${rawSiteName}")`);
    log(`[INJECT] Using domain: ${domain}`);

    const newConfig = {
      manifestUrl: `${domain}/manifest.xml`,
      newsUrl: `${domain}/api/news.json`,
      installDir: "./game",
      lastPatchedVersion: "",
      lastProfileIndex: 0,
      closeAfterLaunch: false,
      extraLaunchParams: "",
      linuxLaunchCommand: "wine"
    };

    await zipLauncher('cityvault-launcher-win', newConfig, siteName);
    await zipLauncher('cityvault-launcher-linux', newConfig, siteName);

    log('\n[INJECT] ✅ All launchers injected and zipped.');
  } catch (err) {
    error('[INJECT] ❌ Failed to inject launcher config:', err);
    throw err;
  }
};

if (require.main === module) {
  module.exports()
    .catch(err => {
      error('[INJECT] ❌ Failed during CLI run:', err);
      process.exit(1);
    });
}
