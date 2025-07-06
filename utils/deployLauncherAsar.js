const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

async function deployLauncherAsar() {
  const sourceAsar = path.join(global.BASE_DIR, 'launcher_downloads/cityvault-launcher-linux/resources/app.asar');
  const destAsar = path.join(global.BASE_DIR, 'public/launcher/app.asar');
  const hashFile = path.join(global.BASE_DIR, 'public/launcher/app.hash');

  if (!fs.existsSync(sourceAsar)) {
    console.warn('[Vault Deploy] app.asar not found. Skipping deployment.');
    return false;
  }

  fs.copyFileSync(sourceAsar, destAsar);
  console.log('[Vault Deploy] Copied app.asar → public/launcher/app.asar');

  const hash = await new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(destAsar);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });

  fs.writeFileSync(hashFile, hash + '\n');
  console.log('[Vault Deploy] Wrote app.hash:', hash);

  return true;
}

module.exports = { deployLauncherAsar };
