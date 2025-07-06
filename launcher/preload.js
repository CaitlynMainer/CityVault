const { ipcRenderer, contextBridge } = require('electron');

ipcRenderer.on('main-log', (_, message) => {
  console.log('[Main]', message);
});
