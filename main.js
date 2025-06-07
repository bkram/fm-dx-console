const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const minimist = require('minimist');
const playAudio = require('./3lasclient');
const { getTunerInfo } = require('./tunerinfo');
const WebSocket = require('ws');
const axios = require('axios');

// Electron refuses to start under root with sandboxing enabled. Automatically
// disable the sandbox if running as root so the app can launch without extra
// command line flags.
if (process.getuid && process.getuid() === 0) {
  app.commandLine.appendSwitch('no-sandbox');
}

let player;
let currentUrl;
let ws;
let pluginWs;

function formatWebSocketURL(url) {
  if (!url) return '';
  if (url.endsWith('/')) url = url.slice(0, -1);
  if (url.startsWith('http://')) {
    return url.replace('http://', 'ws://');
  }
  if (url.startsWith('https://')) {
    return url.replace('https://', 'wss://');
  }
  return url;
}

function createWindow() {
  const argv = minimist(process.argv.slice(2), { string: ['url'], boolean: ['debug'] });
  currentUrl = argv.url || '';
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile('index.html');
  win.webContents.once('did-finish-load', () => {
    win.webContents.send('init-args', argv);
  });
  win.removeMenu();

  const userAgent = `fm-dx-console/${app.getVersion()}`;
  function connectWebSocket(url) {
    if (ws) ws.close();
    if (!url) return;
    const wsAddr = `${formatWebSocketURL(url)}/text`;
    const opts = { headers: { 'User-Agent': `${userAgent} (control)` } };
    ws = new WebSocket(wsAddr, opts);
    ws.on('message', (data) => {
      win.webContents.send('ws-data', data.toString());
    });
  }

  function connectPluginWebSocket(url) {
    if (pluginWs) pluginWs.close();
    if (!url) return;
    const wsAddr = `${formatWebSocketURL(url)}/data_plugins`;
    const opts = { headers: { 'User-Agent': `${userAgent} (plugin)` } };
    pluginWs = new WebSocket(wsAddr, opts);
  }

  connectWebSocket(currentUrl);
  connectPluginWebSocket(currentUrl);

  ipcMain.handle('audio-start', () => {
    if (!currentUrl) return;
    if (!player) {
      const wsAddr = `${formatWebSocketURL(currentUrl)}/audio`;
      const userAgent = `fm-dx-console/${app.getVersion()}`;
      player = playAudio(wsAddr, userAgent, 2048, argv.debug);
    }
    player.play();
  });

  ipcMain.handle('audio-stop', async () => {
    if (player) {
      await player.stop();
    }
  });

  ipcMain.handle('get-tuner-info', async (_e, url) => {
    try {
      return await getTunerInfo(url);
    } catch {
      return null;
    }
  });

  ipcMain.handle('set-url', async (_e, url) => {
    currentUrl = url;
    if (player) {
      await player.stop();
      player = null;
      win.webContents.send('audio-stopped');
    }
    connectWebSocket(currentUrl);
    connectPluginWebSocket(currentUrl);
    win.webContents.send('init-args', { url: currentUrl });
  });

  ipcMain.on('ws-send', (_e, cmd) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(cmd);
    }
  });

  ipcMain.handle('get-spectrum-data', async () => {
    if (!currentUrl) return null;
    try {
      const u = new URL(currentUrl);
      u.pathname += 'spectrum-graph-plugin';
      const res = await axios.get(u.toString(), {
        headers: { 'X-Plugin-Name': 'SpectrumGraphPlugin' }
      });
      return res.data;
    } catch {
      return null;
    }
  });

  ipcMain.handle('start-spectrum-scan', () => {
    if (pluginWs && pluginWs.readyState === WebSocket.OPEN) {
      const msg = JSON.stringify({
        type: 'spectrum-graph',
        value: { status: 'scan' }
      });
      pluginWs.send(msg);
    }
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
