const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  startConsole: () => ipcRenderer.send('start-console'),
  onPtyData: (callback) => ipcRenderer.on('pty-data', (_evt, data) => callback(data)),
  ptyInput: (data) => ipcRenderer.send('pty-input', data)
});
