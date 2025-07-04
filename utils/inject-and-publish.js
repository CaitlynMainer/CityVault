const fs = require('fs-extra');
const path = require('path');
const AdmZip = require('adm-zip');
const tar = require('tar');

const launcherDir = path.join(__dirname, '../launcher_downloads');
const publicDir = path.join(__dirname, '../public/launcher');

async function patchZip(newConfig) {
  const zipPath = path.join(launcherDir, 'cityvault-launcher-win.zip');
  const outZipPath = path.join(publicDir, 'cityvault-launcher-win.zip');

  if (!fs.existsSync(zipPath)) {
    console.warn(`[ZIP] File not found: ${zipPath}`);
    return;
  }

  const tmp = path.join(__dirname, 'tmp_zip');
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(tmp, true);

  await fs.writeFile(path.join(tmp, 'config.json'), JSON.stringify(newConfig, null, 2));
  const newZip = new AdmZip();
  newZip.addLocalFolder(tmp);
  newZip.writeZip(outZipPath);
  await fs.remove(tmp);
}

async function patchTarGz(newConfig) {
  const tarPath = path.join(launcherDir, 'cityvault-launcher-linux.tar.gz');
  const outTarPath = path.join(publicDir, 'cityvault-launcher-linux.tar.gz');

  if (!fs.existsSync(tarPath)) {
    console.warn(`[TAR] File not found: ${tarPath}`);
    return;
  }

  const tmp = path.join(__dirname, 'tmp_tar');
  await fs.ensureDir(tmp);
  await tar.x({ file: tarPath, cwd: tmp });

  await fs.writeFile(path.join(tmp, 'config.json'), JSON.stringify(newConfig, null, 2));
  await tar.c(
    {
      gzip: true,
      file: outTarPath,
      cwd: tmp
    },
    fs.readdirSync(tmp)
  );

  await fs.remove(tmp);
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

    await patchZip(newConfig);
    // await patchTarGz(newConfig); // Uncomment when Linux is ready

    console.log('[INJECT] Launchers patched and published to /public/launcher');
  } catch (err) {
    console.error('[INJECT] Failed to inject launcher config:', err);
    throw err;
  }
};

// If called directly from CLI, run immediately
if (require.main === module) {
  module.exports()
    .catch(err => {
      console.error('[INJECT] Failed during CLI run:', err);
      process.exit(1);
    });
}