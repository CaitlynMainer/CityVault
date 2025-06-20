const fs = require('fs');
const path = require('path');
const https = require('https');
const StreamZip = require('node-stream-zip');
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
	  await downloadWithProgress(IMAGE_SERVER_URL, zipPath);
	} else {
	  console.log('[ImageServer] ImageServer.zip already exists, skipping download.');
	}

  try {
    console.log('[ImageServer] Extracting...');
    //await extract(zipPath, { dir: global.BASE_DIR });
	await extractWithProgress(zipPath, global.BASE_DIR);

    console.log('[ImageServer] Installed to', global.BASE_DIR);
    // Delete the zip after extraction
    //fs.unlinkSync(zipPath);
  } catch (err) {
    throw new Error(`[ImageServer] Extraction failed: ${err.message}`);
  }
}

async function downloadWithProgress(url, zipPath) {
  if (!fs.existsSync(zipPath)) {
    console.log('[ImageServer] Downloading ImageServer.zip...');

    await new Promise((resolve, reject) => {
      const file = fs.createWriteStream(zipPath);

      https.get(url, response => {
        if (response.statusCode !== 200) {
          return reject(new Error(`HTTP ${response.statusCode}`));
        }

        const totalBytes = parseInt(response.headers['content-length'], 10);
        let downloadedBytes = 0;

        response.on('data', chunk => {
          downloadedBytes += chunk.length;
          const percent = downloadedBytes / totalBytes;
          const barLength = 30;
          const filledLength = Math.floor(barLength * percent);
          const bar = '█'.repeat(filledLength) + '-'.repeat(barLength - filledLength);
          const percentText = (percent * 100).toFixed(1).padStart(5);
          process.stdout.write(`\r[ImageServer] [${bar}] ${percentText}%`);
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close(() => {
            process.stdout.write('\n[ImageServer] Download complete.\n');
            resolve();
          });
        });

        file.on('error', reject);
      }).on('error', reject);
    });

  } else {
    console.log('[ImageServer] ImageServer.zip already exists, skipping download.');
  }
}

async function extractWithProgress(zipPath, outputDir) {
  const zip = new StreamZip.async({ file: zipPath });
  const entries = await zip.entries();
  const total = Object.keys(entries).length;

  console.log(`[ImageServer] Extracting ZIP: ${zipPath} → ${outputDir}`);

  let extracted = 0;
  for (const entryName of Object.keys(entries)) {
    const entry = entries[entryName];
    if (entry.isDirectory) {
      fs.mkdirSync(path.join(outputDir, entryName), { recursive: true });
    } else {
      await zip.extract(entryName, path.join(outputDir, entryName));
    }

    extracted++;
    const percent = ((extracted / total) * 100).toFixed(1).padStart(5);
    const barLength = 30;
    const filled = Math.floor((extracted / total) * barLength);
    const bar = '█'.repeat(filled) + '-'.repeat(barLength - filled);
    process.stdout.write(`\r[ImageServer] [${bar}] ${percent}%`);
  }

  await zip.close();
  process.stdout.write('\n[ImageServer] Extraction complete.\n');
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
