const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onInitArgs: (cb) => ipcRenderer.on('init-args', (_e, args) => cb(args)),
  onServerListData: (cb) => ipcRenderer.on('server-list-data', (_e, data) => cb(data)),
  onRdsAdvanced: (cb) => ipcRenderer.on('rds-advanced', (_e, data) => cb(data)),
  getAudioStreamUrl: () => ipcRenderer.invoke('get-audio-stream-url'),
  getTunerInfo: (url) => ipcRenderer.invoke('get-tuner-info', url),
  onWsData: (cb) => ipcRenderer.on('ws-data', (_e, data) => cb(data)),
  onWsError: (cb) => ipcRenderer.on('ws-error', (_e, data) => cb(data)),
  onWsConnected: (cb) => ipcRenderer.on('ws-connected', cb),
  wsSend: (cmd) => ipcRenderer.send('ws-send', cmd),
  setUrl: (url) => ipcRenderer.invoke('set-url', url),
  getSpectrumData: () => ipcRenderer.invoke('get-spectrum-data'),
  startSpectrumScan: () => ipcRenderer.invoke('start-spectrum-scan'),
  getServerList: () => ipcRenderer.invoke('get-server-list'),
  disconnect: () => ipcRenderer.invoke('disconnect'),
  onDisconnected: (cb) => ipcRenderer.on('disconnected', cb)
});
