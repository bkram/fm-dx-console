const { contextBridge, ipcRenderer } = require('electron');

const listen = channel => callback => {
  const listener = (_event, value) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};
contextBridge.exposeInMainWorld('electronAPI', {
  getInitialState: () => ipcRenderer.invoke('get-initial-state'),
  onInitArgs: listen('init-args'), onSettings: listen('settings'),
  onTunerInfo: listen('tuner-info'), onPing: listen('ping'), onRdsAdvanced: listen('rds-advanced'),
  getAudioStreamUrl: () => ipcRenderer.invoke('get-audio-stream-url'),
  getTunerInfo: () => ipcRenderer.invoke('get-tuner-info'),
  onWsData: listen('ws-data'), onWsError: listen('ws-error'),
  onWsConnected: listen('ws-connected'), onReconnecting: listen('ws-reconnecting'),
  tunerAction: (type, value) => ipcRenderer.invoke('tuner-action', type, value),
  setUrl: value => ipcRenderer.invoke('set-url', value),
  saveSignalUnit: unit => ipcRenderer.invoke('save-signal-unit', unit),
  getSpectrumData: () => ipcRenderer.invoke('get-spectrum-data'),
  startSpectrumScan: () => ipcRenderer.invoke('start-spectrum-scan'),
  getServerList: () => ipcRenderer.invoke('get-server-list'),
  disconnect: () => ipcRenderer.invoke('disconnect'), onDisconnected: listen('disconnected')
});
