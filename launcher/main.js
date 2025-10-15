// main.js (full replacement)

const { app, BrowserWindow, ipcMain, Menu, shell, dialog } = require('electron');
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

// ---- Config loading (safe) -------------------------------------------------
const configPath = isDev
  ? path.join(__dirname, 'config.json')
  : path.join(path.dirname(process.execPath), 'config.json');

console.log('[CONFIG] Loading config from:', configPath);

let config;
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (e) {
  // Last-resort guard so the UI still comes up with a helpful message
  console.error('[CONFIG] Failed to load config.json:', e.message);
  config = {
    manifestUrl: 'https://example.invalid/manifest.xml',
    installDir: 'game',
    linuxLaunchCommand: 'wine'
  };
}

// Extract origin for updater
let baseUrl = '';
try {
  const manifestUrlObj = new URL(config.manifestUrl);
  baseUrl = manifestUrlObj.origin;
} catch (e) {
  console.error('[CONFIG] manifestUrl is invalid:', e.message);
}

// ---- Globals ---------------------------------------------------------------
let win;
let logBuffer = [];

// Network timeouts
const NET_TIMEOUT_MS = 10000; // 10s general timeout
const UPDATER_TIMEOUT_MS = 15000; // 15s self-updater ceiling

// ---- Logging to UI ---------------------------------------------------------
function sendLog(line) {
  const tag = '[Main] ' + line;
  console.log(tag);
  if (win?.webContents?.isLoadingMainFrame?.()) {
    logBuffer.push(tag);
  } else if (win?.webContents) {
    try {
      win.webContents.send('patch-log', tag);
    } catch {
      logBuffer.push(tag);
    }
  } else {
    logBuffer.push(tag);
  }
}

// ---- Safety: never block on GPU -------------------------------------------
app.disableHardwareAcceleration();

// ---- Process-level error hooks --------------------------------------------
process.on('uncaughtException', (err) => {
  sendLog(`[FATAL] Uncaught exception: ${err?.stack || err?.message || String(err)}`);
});

process.on('unhandledRejection', (reason) => {
  sendLog(`[FATAL] Unhandled rejection: ${reason?.stack || reason?.message || String(reason)}`);
});

// ---- Helpers ---------------------------------------------------------------
function forceRestart() {
  const exe = process.execPath;
  const args = process.argv.slice(1);
  spawn(exe, args, { detached: true, stdio: 'ignore' }).unref();
  app.exit(0);
}

function withTimeout(promise, ms, label = 'operation') {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

// Safe axios GET with timeout
async function safeAxiosGet(url, opts = {}) {
  sendLog(`[NET] GET ${url}`);
  const res = await axios.get(url, {
    timeout: opts.timeout ?? NET_TIMEOUT_MS,
    responseType: opts.responseType ?? 'text',
    httpsAgent: new https.Agent({ keepAlive: true }),
    maxContentLength: 1024 * 1024 * 50, // 50MB
    maxBodyLength: 1024 * 1024 * 50
  });
  return res.data;
}

// https.get with timeout
function httpsGetText(url, timeoutMs = NET_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    sendLog(`[NET] https.get ${url}`);
    const req = https.get(url, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('Socket timeout'));
    });
  });
}

function httpsDownloadToFile(url, destPath, timeoutMs = NET_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    sendLog(`[NET] download ${url} -> ${destPath}`);
    const file = fs.createWriteStream(destPath);
    const req = https.get(url, (res) => {
      if (res.statusCode !== 200) {
        file.close(() => fs.unlink(destPath, () => {}));
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    });
    req.on('error', (err) => {
      file.close(() => fs.unlink(destPath, () => {}));
      reject(err);
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('Socket timeout'));
    });
  });
}

// ---- UI creation happens FIRST --------------------------------------------
function createWindow(initialForums = [], initialWebsiteUrl = null) {
  win = new BrowserWindow({
    width: 800,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // win.webContents.openDevTools({ mode: 'detach' });
  win.loadFile('index.html');

  win.webContents.on('did-finish-load', () => {
    for (const line of logBuffer) win.webContents.send('patch-log', line);
    logBuffer = [];
  });

  setupMenu(initialForums, initialWebsiteUrl);
}

function setupMenu(forums = [], websiteUrl = null) {
  const forumMenus = forums.map((forum) => ({
    label: forum.name,
    click: () => shell.openExternal(forum.url)
  }));

  const extraMenus = [
    ...forumMenus,
    ...(websiteUrl
      ? [
          {
            label: 'Website',
            click: () => shell.openExternal(websiteUrl)
          }
        ]
      : [])
  ];

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
    },
    // Top-level entries for forums/website (if any)
    ...extraMenus
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ---- Updater ---------------------------------------------------------------
async function getRemoteHash(url) {
  try {
    sendLog(`[Updater] Fetching remote hash from: ${url}`);
    const data = await httpsGetText(url, NET_TIMEOUT_MS);
    const trimmed = data.trim();
    sendLog(`[Updater] Remote hash: ${trimmed}`);
    return trimmed;
  } catch (err) {
    sendLog(`[Updater] Failed to get remote hash: ${err.message}`);
    throw err;
  }
}

function getFileHash(filePath) {
  sendLog(`[Updater] Calculating local file hash: ${filePath}`);
  return new Promise((resolve, reject) => {
    try {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', (err) => reject(err));
    } catch (err) {
      reject(err);
    }
  });
}

async function checkAndUpdateLauncherZip() {
  if (!baseUrl) {
    sendLog('[Updater] Skipping (invalid manifestUrl/baseUrl).');
    return false;
  }

  const localHashPath = path.join(app.getPath('userData'), 'launcher.hash');
  const tmpZip = path.join(app.getPath('temp'), 'launcher_update.zip');
  const tmpExtractDir = path.join(app.getPath('userData'), 'tmp_launcher_extract');
  const extractedAppDir = path.join(tmpExtractDir, 'app');
  const localScriptsDir = path.dirname(app.getAppPath());

  sendLog('[Updater] Checking for launcher.zip update...');

  const remoteHash = await getRemoteHash(`${baseUrl}/launcher/launcher.hash`);
  sendLog(`[Updater] Remote zip hash: ${remoteHash}`);

  let localHash = null;
  if (fs.existsSync(localHashPath)) {
    localHash = fs.readFileSync(localHashPath, 'utf8').trim();
    sendLog(`[Updater] Local zip hash: ${localHash}`);
  }

  if (remoteHash && localHash && remoteHash === localHash) {
    sendLog('[Updater] Already up to date.');
    return false;
  }

  sendLog('[Updater] New version detected. Downloading...');
  await httpsDownloadToFile(`${baseUrl}/launcher/launcher.zip`, tmpZip, NET_TIMEOUT_MS);

  sendLog('[Updater] Extracting launcher.zip to temp folder...');
  await fs.createReadStream(tmpZip).pipe(unzipper.Extract({ path: tmpExtractDir })).promise();

  const mainPath = path.join(extractedAppDir, 'main.js');
  const packagePath = path.join(extractedAppDir, 'package.json');

  const mainExists = fs.existsSync(mainPath);
  const packageExists = fs.existsSync(packagePath);

  if (!mainExists || !packageExists) {
    sendLog('[Updater] Extracted update is invalid. Aborting.');
    sendLog(`[Updater]   main.js: ${mainPath} => ${mainExists ? 'FOUND' : 'MISSING'}`);
    sendLog(`[Updater]   package.json: ${packagePath} => ${packageExists ? 'FOUND' : 'MISSING'}`);
    try {
      const files = fs.readdirSync(extractedAppDir);
      sendLog(`[Updater] Contents of ${extractedAppDir}:`);
      for (const f of files) sendLog(`[Updater]   - ${f}`);
    } catch (err) {
      sendLog(`[Updater] Could not list contents of ${extractedAppDir}: ${err.message}`);
    }
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

// ---- Manifest / menu population (non-blocking) -----------------------------
async function fetchAndApplyMenu() {
  let forums = [];
  let websiteUrl = null;

  try {
    const xml = await safeAxiosGet(config.manifestUrl, { timeout: NET_TIMEOUT_MS });
    const parser = new XMLParser({ ignoreAttributes: false });
    const parsed = parser.parse(xml);

    websiteUrl = parsed?.manifest?.webpage || null;

    const forumList = parsed?.manifest?.forums?.forum;
    if (Array.isArray(forumList)) {
      forums = forumList.map((f) => ({ name: f['@_name'], url: f['@_url'] }));
    } else if (forumList?.['@_name']) {
      forums = [{ name: forumList['@_name'], url: forumList['@_url'] }];
    }

    sendLog(`[Menu] Loaded ${forums.length} forum link(s)`);
    if (websiteUrl) sendLog(`[Menu] Website link: ${websiteUrl}`);

    // Rebuild menu to include new links
    setupMenu(forums, websiteUrl);
  } catch (err) {
    sendLog(`[ERROR] Failed to parse forums/webpage from manifest: ${err.message}`);
    // Keep existing menu (File only)
  }
}

// ---- App lifecycle ---------------------------------------------------------
app.whenReady().then(async () => {
  sendLog(`[DEBUG] Launcher PID: ${process.pid}`);

  // 1) Create the window IMMEDIATELY so the user always sees UI
  createWindow([], null);

  // 2) Kick off non-blocking tasks in the background

  // 2a) Self-updater: run it with an overall timeout; if it updates, restart.
  if (!isDev && baseUrl) {
    try {
      const updated = await withTimeout(
        checkAndUpdateLauncherZip(),
        UPDATER_TIMEOUT_MS,
        'self-updater'
      ).catch((e) => {
        sendLog(`[Updater] Skipped due to error: ${e.message}`);
        return false;
      });

      if (updated) {
        sendLog('[Updater] Update applied. Restarting...');
        forceRestart();
        return;
      }
    } catch (e) {
      sendLog(`[Updater] Non-fatal updater failure: ${e.message}`);
    }
  } else if (!isDev) {
    sendLog('[Updater] Skipping updater (no valid baseUrl).');
  }

  // 2b) Fetch manifest + build menu (non-blocking)
  fetchAndApplyMenu();
});

// Quit on all windows closed (standard desktop behavior)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---- IPC handlers ----------------------------------------------------------
ipcMain.handle('start-patch', async (event) => {
  const manifestUrl = config.manifestUrl;
  const installDir = path.join(path.dirname(process.execPath), config.installDir || 'game');

  try {
    await patchFromManifest(
      manifestUrl,
      installDir,
      (progress) => event.sender.send('patch-progress', progress),
      (logLine) => {
        event.sender.send('patch-log', logLine);
        sendLog(logLine);
      }
    );
  } catch (e) {
    const msg = `[PATCH ERROR] ${e?.message || String(e)}`;
    event.sender.send('patch-log', msg);
    sendLog(msg);
    dialog.showErrorBox('Patch Error', msg);
  }
});

ipcMain.handle('get-launch-profiles', async () => {
  try {
    sendLog(`[get-launch-profiles] Fetching from: ${config.manifestUrl}`);
    const xml = await safeAxiosGet(config.manifestUrl, { timeout: NET_TIMEOUT_MS });
    const parser = new XMLParser({ ignoreAttributes: false });
    const parsed = parser.parse(xml);
    const launches = parsed?.manifest?.profiles;

    const extract = (type) => {
      const items = launches?.[type];
      return Array.isArray(items) ? items : items ? [items] : [];
    };

    return [...extract('launch'), ...extract('devlaunch')].map((entry) => ({
      name: entry['#text'] || 'Unnamed Profile',
      exec: entry['@_exec'],
      params: entry['@_params']
    }));
  } catch (e) {
    sendLog(`[get-launch-profiles] Failed: ${e.message}`);
    return [];
  }
});

ipcMain.handle('launch-game', async (event, { exec, params, closeLauncher }) => {
  const cwd = path.resolve(path.dirname(process.execPath), config.installDir || 'game');
  const args = (params || '').trim().length ? params.trim().split(/\s+/) : [];

  let command, finalArgs;

  if (os.platform() === 'win32') {
    command = path.resolve(cwd, exec);
    finalArgs = args;
  } else {
    const wineCmd = config.linuxLaunchCommand || 'wine';
    try {
      await which(wineCmd);
    } catch {
      const msg = `[LAUNCH ERROR] ${wineCmd} not found in PATH`;
      event.sender.send('patch-log', msg);
      sendLog(msg);
      return;
    }
    command = wineCmd;
    finalArgs = [path.resolve(cwd, exec), ...args];
  }

  sendLog(`[LAUNCH] Working directory: ${cwd}`);
  sendLog(`[LAUNCH] Executable: ${command}`);
  sendLog(`[LAUNCH] Params: ${finalArgs.join(' ')}`);

  try {
    const child = spawn(command, finalArgs, {
      cwd,
      detached: true,
      stdio: 'ignore'
    });
    child.unref();

    if (closeLauncher) app.quit();
  } catch (e) {
    const msg = `[LAUNCH ERROR] ${e.message}`;
    event.sender.send('patch-log', msg);
    sendLog(msg);
  }
});
