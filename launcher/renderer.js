const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  fetchParsedManifest,
  getManifestPoster,
  getManifestLabel,
  getManifestVersion
} = require('./patcher');

const isDev = !process.defaultApp && process.execPath.endsWith('electron.exe');

// In dev: use the project root
// In production: use the folder next to the packaged exe
const configPath = isDev
  ? path.join(__dirname, 'config.json')
  : path.join(path.dirname(process.execPath), 'config.json');

const logPath = isDev
  ? path.join(__dirname, 'launcher.log')
  : path.join(path.dirname(process.execPath), 'launcher.log');

console.log("Using config path:", configPath);

let config = {};
try {
  console.log('Trying to load config from', configPath);
  fs.appendFileSync('debug.txt', `Trying to load config from ${configPath}\n`);
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
} catch (err) {
  console.error('Failed to read config.json:', err);
  fs.appendFileSync(logPath, `[${new Date().toISOString()}] Failed to read config: ${err.message}\n`);
  config = {};
}

function saveConfig() {
  config.linuxLaunchCommand = config.linuxLaunchCommand || 'wine';
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (err) {
    console.error('Failed to save config.json:', err);
  }
}


let selectedProfile = null;
const manifestUrl = config.manifestUrl;

window.addEventListener('DOMContentLoaded', () => {
  const log = document.getElementById('log');
  const overallBar = document.getElementById('overallProgress');
  const overallLabel = document.getElementById('overallLabel');
  const patchBtn = document.getElementById('patchBtn');
  const launchBtn = document.getElementById('launchBtn');

  ipcRenderer.send('log', 'hello from renderer');
  ipcRenderer.on('open-settings', () => {
    document.getElementById('openSettingsBtn')?.click();
  });

  // Hide Linux field if on Windows
  if (os.platform() === 'win32') {
    const linuxField = document.getElementById('linuxLaunchCommandField');
    if (linuxField) linuxField.classList.add('hidden');
  }

fetchParsedManifest(manifestUrl).then(parsed => {
  if (!parsed) {
    log.innerText += "Failed to fetch manifest.\n";
    return;
  }

  const poster = getManifestPoster(parsed);
  const label = getManifestLabel(parsed);
  const currentVersion = getManifestVersion(parsed);

  if (poster) {
    const bg = document.getElementById('launcherBackground');
    if (bg) {
      bg.style.backgroundImage = `url('${poster}')`;
    }
  }

  if (label) {
    console.log('[DEBUG] Manifest Label:', label);
    document.title = label;
  }

  if (currentVersion && config.lastPatchedVersion !== currentVersion) {
    log.innerText += `Detected new version (${currentVersion}). Auto-patching...\n`;
    overallBar.style.width = '0%';
    overallLabel.textContent = 'Progress: 0 / 0';

    ipcRenderer.invoke('start-patch').then(() => {
      config.lastPatchedVersion = currentVersion;
      saveConfig();
      log.innerText += "Auto-patch completed.\n";
    }).catch(err => {
      log.innerText += `Auto-patch failed: ${err.message || err}\n`;
    });
  } else {
    log.innerText += "Game is up to date.\n";
  }
});

  // Load news
  if (config.newsUrl) {
    loadNewsFeed(config.newsUrl);
  }

  // Patch button
  patchBtn.addEventListener('click', async () => {
    log.innerText += "Starting patch...\n";
    overallBar.style.width = '0%';
    overallLabel.textContent = 'Progress: 0 / 0';
    await ipcRenderer.invoke('start-patch');
    log.innerText += "Patch complete.\n";
  });

  // Patch events
  ipcRenderer.on('patch-progress', (event, data) => {
    if (data.type === 'overall-progress') {
      const percent = (data.completed / data.total) * 100;
      overallBar.style.width = percent + '%';
      overallLabel.textContent = `Progress: ${data.completed} / ${data.total}`;
      log.scrollTop = log.scrollHeight;
    }
  });

  ipcRenderer.on('patch-log', (event, line) => {
    log.innerText += line + '\n';
    log.scrollTop = log.scrollHeight;
  });

  // Launch
  launchBtn.addEventListener('click', () => {
    if (selectedProfile) {
      let fullParams = selectedProfile.params || '';
      if (config.extraLaunchParams) {
        fullParams += ' ' + config.extraLaunchParams;
      }

      ipcRenderer.invoke('launch-game', {
        exec: selectedProfile.exec,
        params: fullParams,
        closeLauncher: config.closeAfterLaunch,
        linuxLaunchCommand: config.linuxLaunchCommand || 'wine'
      });
    } else {
      alert('Please select a launch profile.');
    }
  });

  // Load profiles
  loadProfiles();

  // Auto-patch on version mismatch
  // getManifestVersion(manifestUrl).then(currentVersion => {
  //   if (currentVersion && config.lastPatchedVersion !== currentVersion) {
  //     log.innerText += `Detected new version (${currentVersion}). Auto-patching...\n`;
  //     overallBar.style.width = '0%';
  //     overallLabel.textContent = 'Progress: 0 / 0';

  //     ipcRenderer.invoke('start-patch').then(() => {
  //       config.lastPatchedVersion = currentVersion;
  //       saveConfig();
  //       log.innerText += "Auto-patch completed.\n";
  //     }).catch(err => {
  //       log.innerText += `Auto-patch failed: ${err.message || err}\n`;
  //     });
  //   } else {
  //     log.innerText += "Game is up to date.\n";
  //   }
  // });

  // Settings modal
  const modal = document.getElementById('settingsModal');
  const openBtn = document.getElementById('openSettingsBtn');
  const closeBtns = [
    document.getElementById('closeSettingsBtn'),
    document.getElementById('closeSettingsBtn2')
  ];
  const saveBtn = document.getElementById('saveSettingsBtn');
  const closeAfterLaunch = document.getElementById('closeAfterLaunch');
  const extraParams = document.getElementById('extraParams');
  const linuxCommand = document.getElementById('linuxLaunchCommand');

  openBtn.addEventListener('click', () => {
    closeAfterLaunch.checked = !!config.closeAfterLaunch;
    extraParams.value = config.extraLaunchParams || '';
    linuxCommand.value = config.linuxLaunchCommand || 'wine';
    modal.classList.remove('hidden');
  });

  closeBtns.forEach(btn => btn.addEventListener('click', () => {
    modal.classList.add('hidden');
  }));

  saveBtn.addEventListener('click', () => {
    config.closeAfterLaunch = closeAfterLaunch.checked;
    config.extraLaunchParams = extraParams.value.trim();
    config.linuxLaunchCommand = linuxCommand.value.trim() || 'wine';
    saveConfig();
    modal.classList.add('hidden');
    log.innerText += "Settings saved.\n";
  });
});

async function loadProfiles() {
  const profileList = document.getElementById('profileList');
  const profiles = await ipcRenderer.invoke('get-launch-profiles');
  profileList.innerHTML = '';

  let autoSelectIndex = 0;
  if (typeof config.lastProfileIndex === 'number' && profiles[config.lastProfileIndex]) {
    autoSelectIndex = config.lastProfileIndex;
  }

  profiles.forEach((profile, idx) => {
    const div = document.createElement('div');
    div.textContent = profile.name;
    div.dataset.index = idx;
    div.className = `
      profile-entry bg-gray-800 hover:bg-blue-600 text-white 
      rounded-lg px-4 py-2 font-semibold shadow 
      transition-colors cursor-pointer
    `;

    div.addEventListener('click', () => {
      document.querySelectorAll('.profile-entry').forEach(el =>
        el.classList.remove('ring-2', 'ring-yellow-400')
      );
      div.classList.add('ring-2', 'ring-yellow-400');
      selectedProfile = profile;
      config.lastProfileIndex = idx;
      saveConfig();
    });

    profileList.appendChild(div);

    if (idx === autoSelectIndex) {
      setTimeout(() => div.click(), 0);
    }
  });
}

async function loadNewsFeed(newsUrl) {
  const newsContent = document.getElementById('newsContent');
  if (!newsContent) return;

  try {
    const res = await fetch(newsUrl);
    const news = await res.json();

    if (!Array.isArray(news) || news.length === 0) {
      newsContent.innerHTML = '<div>No news available.</div>';
      return;
    }

    newsContent.innerHTML = '';
    for (const item of news.slice(0, 4)) {
      const localDate = new Date(item.date).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short'
      });

      const div = document.createElement('div');
      div.innerHTML = `
        <div class="font-semibold text-blue-300">${item.title}</div>
        <div class="text-gray-300">${item.content}</div>
        <div class="text-gray-500 text-xs italic">${localDate}</div>
      `;
      newsContent.appendChild(div);
    }
  } catch (err) {
    newsContent.innerHTML = `<div class="text-red-400">Failed to load news.</div>`;
    console.error('[NEWS ERROR]', err);
  }
}
