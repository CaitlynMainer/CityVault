const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');
const { patchFromManifest } = require('./patcher');
const os = require('os');
const which = require('which');
const fs = require('fs');

const isDev = !app.isPackaged;

const configPath = isDev
  ? path.join(__dirname, 'config.json')
  : path.join(path.dirname(process.execPath), 'config.json');

console.log('[CONFIG] Loading config from:', configPath);

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const { Menu } = require('electron');
let win;
app.disableHardwareAcceleration();

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

  //win.webContents.openDevTools({ mode: 'detach' });

  win.loadFile('index.html');

  setupMenu(); // setup menu *after* win is created
}

app.whenReady().then(createWindow);

function setupMenu() {
  const { Menu } = require('electron');

  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Settings',
          click: () => {
            if (win) {
              win.webContents.send('open-settings');
            }
          }
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}



ipcMain.handle('start-patch', async (event) => {
  const manifestUrl = config.manifestUrl;
  const installDir = path.join(path.dirname(process.execPath), 'game');

  await patchFromManifest(
    manifestUrl,
    installDir,
    (progress) => {
      event.sender.send('patch-progress', progress);
    },
    (logLine) => {
      event.sender.send('patch-log', logLine);
    }
  );
});

ipcMain.handle('get-launch-profiles', async () => {
  const manifestUrl = config.manifestUrl;
  console.log('[get-launch-profiles] manifestUrl:', manifestUrl);
  const xml = await axios.get(manifestUrl).then(r => r.data);
  const parser = new XMLParser({ ignoreAttributes: false });
  const parsed = parser.parse(xml);
  const launches = parsed?.manifest?.profiles;

  const extract = (type) => {
    const items = launches?.[type];
    if (!items) return [];
    return Array.isArray(items) ? items : [items];
  };

  const result = [
    ...extract('launch'),
    ...extract('devlaunch')
  ].map(entry => ({
    name: entry['#text'] || 'Unnamed Profile',
    exec: entry['@_exec'],
    params: entry['@_params']
  }));

  return result;
});

ipcMain.handle('launch-game', async (event, { exec, params, closeLauncher }) => {
  const cwd = path.resolve(path.dirname(process.execPath), config.installDir);

  const args = params.trim().split(/\s+/);

  let command, finalArgs;

  if (os.platform() === 'win32') {
    // Windows
    command = path.resolve(cwd, exec);
    finalArgs = args;
  } else {
    // Linux/macOS
    const wineCmd = config.linuxLaunchCommand || 'wine';

    try {
      await which(wineCmd); // throws if not found
    } catch {
      event.sender.send('patch-log', `[LAUNCH ERROR] ${wineCmd} not found in PATH`);
      return;
    }

    command = wineCmd;
    finalArgs = [path.resolve(cwd, exec), ...args];
  }

  console.log(`[LAUNCH] Working directory: ${cwd}`);
  console.log(`[LAUNCH] Executable: ${command}`);
  event.sender.send('patch-log', `[LAUNCH] Params: ${finalArgs.join(' ')}`);

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



