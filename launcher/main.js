const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');
const { patchFromManifest } = require('./patcher');
const os = require('os');
const which = require('which');
const fs = require('fs');
const crypto = require('crypto');
const https = require('https');
const unzipper = require('unzipper');

const isDev = !app.isPackaged;

const configPath = path.join(path.dirname(process.execPath), 'config.json');

console.log('[CONFIG] Loading config from:', configPath);

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const manifestUrl = new URL(config.manifestUrl);
const baseUrl = manifestUrl.origin;

let win;
let logBuffer = [];

function sendLog(line) {
  const tag = '[Main] ' + line;
  console.log(tag); // fallback log to terminal if visible
  if (win?.webContents?.isLoadingMainFrame?.()) {
    logBuffer.push(tag);
  } else if (win?.webContents) {
    win.webContents.send('patch-log', tag);
  } else {
    logBuffer.push(tag);
  }
}

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const updated = await checkAndUpdateLauncherZip();
  if (updated) {
    sendLog('[Updater] Update applied. Restarting...');
    app.relaunch();
    app.exit();
    return;
  }

  createWindow();
});

function createWindow() {
  win = new BrowserWindow({
    width: 800,
    height: 650,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.webContents.openDevTools({ mode: 'detach' });
  win.loadFile('index.html');

  win.webContents.on('did-finish-load', () => {
    for (const line of logBuffer) {
      win.webContents.send('patch-log', line);
    }
    logBuffer = [];
  });

  setupMenu();
}

function setupMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Settings',
          click: () => win?.webContents.send('open-settings')
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Update logic
function getRemoteHash(url) {
  sendLog(`[Updater] Fetching remote hash from: ${url}`);
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode !== 200) return reject(`Hash fetch failed: ${res.statusCode}`);
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        sendLog(`[Updater] Remote hash: ${data.trim()}`);
        resolve(data.trim());
      });
    }).on('error', err => {
      sendLog(`[Updater] Error fetching remote hash: ${err.message}`);
      reject(err);
    });
  });
}

function getFileHash(filePath) {
  sendLog(`[Updater] Calculating local file hash: ${filePath}`);
  return new Promise((resolve, reject) => {
    try {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', chunk => hash.update(chunk));
      stream.on('end', () => {
        const digest = hash.digest('hex');
        sendLog(`[Updater] Local file hash: ${digest}`);
        resolve(digest);
      });
      stream.on('error', err => {
        sendLog(`[Updater] Error reading file for hash: ${err.message}`);
        reject(err);
      });
    } catch (err) {
      sendLog(`[Updater] Exception during hashing: ${err.message}`);
      reject(err);
    }
  });
}

function downloadFile(url, destPath) {
  sendLog(`[Updater] Downloading update from ${url}`);
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, res => {
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      res.pipe(file);
      file.on('finish', () => {
        sendLog(`[Updater] Downloaded update to ${destPath}`);
        file.close(resolve);
      });
    }).on('error', err => {
      sendLog(`[Updater] Download error: ${err.message}`);
      reject(err);
    });
  });
}

async function checkAndUpdateLauncherZip() {
  const localHashPath = path.join(app.getPath('userData'), 'launcher.hash');
  const tmpZip = path.join(app.getPath('temp'), 'launcher_update.zip');
  const tmpExtractDir = path.join(app.getPath('userData'), 'tmp_launcher_extract');
  const localScriptsDir = path.dirname(app.getAppPath());

  sendLog(`[Updater] Checking for launcher.zip update...`);

  const remoteHash = await getRemoteHash(`${baseUrl}/launcher/launcher.hash`);
  sendLog(`[Updater] Remote zip hash: ${remoteHash}`);

  let localHash = null;
  if (fs.existsSync(localHashPath)) {
    localHash = fs.readFileSync(localHashPath, 'utf8').trim();
    sendLog(`[Updater] Local zip hash: ${localHash}`);
  }

  if (remoteHash === localHash) {
    sendLog('[Updater] Already up to date.');
    return false;
  }

  sendLog('[Updater] New version detected. Downloading...');

  await downloadFile(`${baseUrl}/launcher/launcher.zip`, tmpZip);

  sendLog('[Updater] Extracting launcher.zip to temp folder...');
  await fs.createReadStream(tmpZip)
    .pipe(unzipper.Extract({ path: tmpExtractDir }))
    .promise();

  // Sanity check to make sure it's a valid Electron app
  const mainExists = fs.existsSync(path.join(tmpExtractDir, 'main.js'));
  const packageExists = fs.existsSync(path.join(tmpExtractDir, 'package.json'));

  if (!mainExists || !packageExists) {
    sendLog('[Updater] Extracted update is invalid (missing main.js or package.json). Aborting.');
    fs.unlinkSync(tmpZip);
    fs.rmSync(tmpExtractDir, { recursive: true, force: true });
    return false;
  }

  sendLog('[Updater] Copying update over current app...');
  fs.cpSync(tmpExtractDir, localScriptsDir, { recursive: true });

  fs.writeFileSync(localHashPath, remoteHash);
  fs.unlinkSync(tmpZip);
  fs.rmSync(tmpExtractDir, { recursive: true, force: true });

  sendLog('[Updater] Update complete.');
  return true;
}

// IPC handlers
ipcMain.handle('start-patch', async (event) => {
  const manifestUrl = config.manifestUrl;
  const installDir = path.join(path.dirname(process.execPath), 'game');

  await patchFromManifest(
    manifestUrl,
    installDir,
    (progress) => event.sender.send('patch-progress', progress),
    (logLine) => {
      event.sender.send('patch-log', logLine);
      sendLog(logLine);
    }
  );
});

ipcMain.handle('get-launch-profiles', async () => {
  const manifestUrl = config.manifestUrl;
  sendLog(`[get-launch-profiles] Fetching from: ${manifestUrl}`);
  const xml = await axios.get(manifestUrl).then(r => r.data);
  const parser = new XMLParser({ ignoreAttributes: false });
  const parsed = parser.parse(xml);
  const launches = parsed?.manifest?.profiles;

  const extract = (type) => {
    const items = launches?.[type];
    return Array.isArray(items) ? items : items ? [items] : [];
  };

  return [
    ...extract('launch'),
    ...extract('devlaunch')
  ].map(entry => ({
    name: entry['#text'] || 'Unnamed Profile',
    exec: entry['@_exec'],
    params: entry['@_params']
  }));
});

ipcMain.handle('launch-game', async (event, { exec, params, closeLauncher }) => {
  const cwd = path.resolve(path.dirname(process.execPath), config.installDir);
  const args = params.trim().split(/\s+/);

  let command, finalArgs;

  if (os.platform() === 'win32') {
    command = path.resolve(cwd, exec);
    finalArgs = args;
  } else {
    const wineCmd = config.linuxLaunchCommand || 'wine';
    try {
      await which(wineCmd);
    } catch {
      event.sender.send('patch-log', `[LAUNCH ERROR] ${wineCmd} not found in PATH`);
      return;
    }

    command = wineCmd;
    finalArgs = [path.resolve(cwd, exec), ...args];
  }

  sendLog(`[LAUNCH] Working directory: ${cwd}`);
  sendLog(`[LAUNCH] Executable: ${command}`);
  sendLog(`[LAUNCH] Params: ${finalArgs.join(' ')}`);

  const child = spawn(command, finalArgs, {
    cwd,
    detached: true,
    stdio: 'ignore'
  });

  child.unref();

  if (closeLauncher) {
    app.quit();
  }
});
