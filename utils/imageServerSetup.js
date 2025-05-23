const fs = require('fs');
const path = require('path');
const https = require('https');
const extract = require('extract-zip');
const { spawn } = require('child_process');
const { exec } = require('child_process');
const os = require('os');

const IMAGE_SERVER_URL = 'https://cityofheroes.dev/cohtools/imageserver/ImageServer.zip';
const zipPath = path.join(global.BASE_DIR, 'ImageServer.zip');
const installDir = path.join(global.BASE_DIR, 'ImageServer');

let imageServerProc = null;

function isImageServerRunning() {
  return new Promise((resolve) => {
    const isWindows = os.platform() === 'win32';
    const cmd = isWindows
      ? 'tasklist'
      : "ps -A -o comm"; // Just the command name column

    exec(cmd, (err, stdout) => {
      if (err || !stdout) return resolve(false);
      const target = 'cityofheroes.exe'; // you could make this configurable
      resolve(stdout.toLowerCase().includes(target.toLowerCase()));
    });
  });
}


async function ensureImageServerInstalled() {

  const alreadyRunning = await isImageServerRunning();
  if (alreadyRunning) {
    console.log('[ImageServer] Already running, skipping launch.');
    return;
  }

  if (fs.existsSync(installDir)) {
    console.log('[ImageServer] Already installed.');
    return;
  }

  if (!fs.existsSync(zipPath)) {
    console.log('[ImageServer] Downloading ImageServer.zip...');
    await new Promise((resolve, reject) => {
      const file = fs.createWriteStream(zipPath);
      https.get(IMAGE_SERVER_URL, response => {
        if (response.statusCode !== 200) {
          return reject(new Error(`HTTP ${response.statusCode}`));
        }

        response.pipe(file);
        file.on('finish', () => file.close(resolve));
        file.on('error', reject);
      }).on('error', reject);
    });
    console.log('[ImageServer] Download complete.');
  } else {
    console.log('[ImageServer] ImageServer.zip already exists, skipping download.');
  }

  try {
    console.log('[ImageServer] Extracting...');
    await extract(zipPath, { dir: global.BASE_DIR });
    console.log('[ImageServer] Installed to', installDir);
    // Delete the zip after extraction
    fs.unlinkSync(zipPath);
  } catch (err) {
    throw new Error(`[ImageServer] Extraction failed: ${err.message}`);
  }
}

function launchImageServer(config) {
  const exePath = path.join(global.BASE_DIR, 'ImageServer', 'bin', 'win64', 'live', 'cityofheroes.exe');
  const renderDir = config.costumeRendering.outputPath;
  const imageOutDir = config.costumeRendering.renderOutputPath;

  const env = {
    ...process.env,
    GALLIUM_DRIVER: 'llvmpipe',
    LIBGL_ALWAYS_SOFTWARE: 'true',
    MESA_NO_ERROR: '1',
    MESA_LOG_LEVEL: 'debug'
  };

  imageServerProc = spawn(exePath, [
    '-assetpath', 'assets\\issue24;assets\\issue25',
    '-profile', 'ImageServer',
    '-nojpg',
    '-imageserver', `${renderDir} ${imageOutDir}`,
    '-screen', '200', '200',
    '-maxfps', '1'
  ], {
    windowsHide: true,
    cwd: path.dirname(exePath),
    env,
    detached: false,
    stdio: 'ignore'
  });

  console.log('[ImageServer] Launched.');

  imageServerProc.unref();
}
// Graceful shutdown
function cleanupImageServer() {
  if (imageServerProc && !imageServerProc.killed) {
    console.log('[ImageServer] Terminating...');
    imageServerProc.kill();
  }
}

// Hook into process exit signals
process.on('exit', cleanupImageServer);
process.on('SIGINT', () => { cleanupImageServer(); process.exit(); });
process.on('SIGTERM', () => { cleanupImageServer(); process.exit(); });
process.on('uncaughtException', (err) => {
  console.error('[CityVault] Uncaught Exception:', err);
  cleanupImageServer();
  process.exit(1);
});

module.exports = {
  ensureImageServerInstalled,
  launchImageServer,
};
