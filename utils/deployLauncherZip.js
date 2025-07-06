const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const archiver = require('archiver');

async function deployLauncherZip() {
  const sourceDir = path.join(global.BASE_DIR, 'launcher_downloads/cityvault-launcher-linux/resources');
  const destZip = path.join(global.BASE_DIR, 'public/launcher/launcher.zip');
  const hashFile = path.join(global.BASE_DIR, 'public/launcher/launcher.hash');

  const output = fs.createWriteStream(destZip);
  const archive = archiver('zip', { zlib: { level: 9 } });

  archive.pipe(output);
  archive.directory(sourceDir, false); // zip the folder contents, not the folder itself
  await archive.finalize();

  console.log('[Vault Deploy] Zipped → public/launcher/launcher.zip');

  const hash = await new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    const s = fs.createReadStream(destZip);
    s.on('data', chunk => h.update(chunk));
    s.on('end', () => resolve(h.digest('hex')));
    s.on('error', reject);
  });

  fs.writeFileSync(hashFile, hash + '\n');
  console.log('[Vault Deploy] Wrote launcher.hash:', hash);

  return true;
}

module.exports = { deployLauncherZip };
