const fs = require('fs-extra');
const path = require('path');
const AdmZip = require('adm-zip');

const launcherDir = path.join(__dirname, '../launcher_downloads');
const publicDir = path.join(__dirname, '../public/launcher');

async function zipLauncher(platformFolder, newConfig) {
  const sourceDir = path.join(launcherDir, platformFolder);
  const outputZip = path.join(publicDir, `${platformFolder}.zip`);

  if (!fs.existsSync(sourceDir)) {
    console.warn(`[ZIP] Source folder not found: ${sourceDir}`);
    return;
  }

  const configPath = path.join(sourceDir, 'config.json');
  await fs.writeFile(configPath, JSON.stringify(newConfig, null, 2));

  const zip = new AdmZip();
  zip.addLocalFolder(sourceDir);
  zip.writeZip(outputZip);

  console.log(`[ZIP] Created: ${outputZip}`);
}

module.exports = async function injectAndPublish() {
  try {
    const manifestPath = path.join(__dirname, '../data/manifest-config.json');
    const manifestRaw = await fs.readFile(manifestPath, 'utf8');
    const manifestConfig = JSON.parse(manifestRaw);
    const domain = manifestConfig.webpage?.replace(/\/+$/, '');

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

    await fs.ensureDir(publicDir);
    await zipLauncher('cityvault-launcher-win', newConfig);
    await zipLauncher('cityvault-launcher-linux', newConfig);

    console.log('[INJECT] Launchers patched and zipped into /public/launcher');
  } catch (err) {
    console.error('[INJECT] Failed to inject launcher config:', err);
    throw err;
  }
};

// If run directly
if (require.main === module) {
  module.exports()
    .catch(err => {
      console.error('[INJECT] Failed during CLI run:', err);
      process.exit(1);
    });
}
