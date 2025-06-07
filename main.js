const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const minimist = require('minimist');
const playAudio = require('./3lasclient');
const { getTunerInfo } = require('./tunerinfo');
const WebSocket = require('ws');

let player;
let currentUrl;
let ws;

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

  connectWebSocket(currentUrl);

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

  ipcMain.handle('set-url', (_e, url) => {
    currentUrl = url;
    connectWebSocket(currentUrl);
    win.webContents.send('init-args', { url: currentUrl });
  });

  ipcMain.on('ws-send', (_e, cmd) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(cmd);
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
