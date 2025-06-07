const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onInitArgs: (cb) => ipcRenderer.on('init-args', (_e, args) => cb(args)),
  startAudio: () => ipcRenderer.invoke('audio-start'),
  stopAudio: () => ipcRenderer.invoke('audio-stop'),
  getTunerInfo: (url) => ipcRenderer.invoke('get-tuner-info', url),
  onWsData: (cb) => ipcRenderer.on('ws-data', (_e, data) => cb(data)),
  sendCommand: (cmd) => ipcRenderer.send('ws-send', cmd),
  setUrl: (url) => ipcRenderer.invoke('set-url', url),
  onAudioStopped: (cb) => ipcRenderer.on('audio-stopped', cb)
});
