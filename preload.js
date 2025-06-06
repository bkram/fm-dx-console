const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onInitArgs: (cb) => ipcRenderer.on('init-args', (_e, args) => cb(args)),
  startAudio: () => ipcRenderer.invoke('audio-start'),
  stopAudio: () => ipcRenderer.invoke('audio-stop')
});
