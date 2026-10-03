const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const minimist = require('minimist');
const { getTunerInfo } = require('../shared/tunerinfo.cjs');
const { createRdsDecoder } = require('../shared/rds-decoder.cjs');
const WebSocket = require('ws');
const axios = require('axios');

// Parse command line arguments early so sandbox flags are handled before Electron initializes.
const argv = minimist(process.argv.slice(app.isPackaged ? 1 : 2), {
  string: ['url'],
  boolean: ['dev', 'sandbox', 'help'],
  default: { sandbox: true }
});

// Normalize URL if provided
if (argv.url) {
  try {
    const url = new URL(argv.url.trim());
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Use http:// or https://');
    url.hash = '';
    argv.url = url.toString();
  } catch (error) { console.error('Invalid URL:', error.message); process.exit(1); }
}

if (argv.help) {
  console.log('Usage: fm-dx-console-gui [--no-sandbox] [--dev] [--url <fm-dx>]');
  process.exit(0);
}

if (!argv.sandbox) {
  app.commandLine.appendSwitch('no-sandbox');
}

// Electron refuses to start under root with sandboxing enabled. Automatically
// disable the sandbox if running as root so the app can launch without extra
// command line flags.
if (process.getuid && process.getuid() === 0) {
  app.commandLine.appendSwitch('no-sandbox');
}

let currentUrl = argv.url || '';
let ws;
let pluginWs;
let rdsWs;
let rdsDecoder = createRdsDecoder();

function normalizeServerUrl(value) {
  if (!value) return '';
  const url = new URL(value.trim());
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Use http:// or https://');
  url.hash = '';
  url.pathname = url.pathname.replace(/\/+$/, '') + '/';
  return url.toString();
}

function socketEndpoint(value, endpoint) {
  const url = new URL(normalizeServerUrl(value));
  url.pathname += endpoint;
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

async function resolveUrl(url) {
  if (!url) return '';
  url = url.trim();
  if (url.endsWith('/')) url = url.slice(0, -1);
  try {
    const res = await axios.head(url, { maxRedirects: 5, timeout: 3000 });
    return res.request.res.responseUrl || url;
  } catch {
    return url;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    backgroundColor: '#f4f4f5',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true
    }
  });

  win.webContents.on('did-fail-load', (_e, errorCode, errorDesc) => {
    console.error('Failed to load:', errorCode, errorDesc);
  });

  win.webContents.on('crashed', () => {
    console.error('Renderer process crashed');
  });

  if (argv.dev) {
    win.webContents.openDevTools();
  }

  function sendToRenderer(channel, data) {
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, data);
    }
  }

  win.loadFile(path.join(__dirname, 'index.html'));
  win.webContents.once('did-finish-load', async () => {
    // Release CI launches the actual packaged window, validates the preload and
    // local assets, then exits without contacting a server or changing settings.
    if (process.env.FM_DX_SMOKE_REPORT) {
      try {
        const state = await win.webContents.executeJavaScript(`(async () => {
          await Promise.all([...document.fonts].map(font => font.load()));
          await document.fonts.ready;
          return { title: document.title, api: typeof window.electronAPI,
            controls: document.querySelectorAll('button').length,
            fonts: document.fonts.size === 3 && [...document.fonts].every(font => font.status === 'loaded') };
        })()`);
        require('node:fs').writeFileSync(process.env.FM_DX_SMOKE_REPORT,
          JSON.stringify({ ...state, version: app.getVersion() }));
        app.exit(0);
      } catch (error) { console.error('GUI smoke test:', error); app.exit(1); }
      return;
    }
    console.log('Page loaded, fetching server list...');
    sendToRenderer('init-args', { url: currentUrl, version: app.getVersion(), dev: argv.dev });
    try {
      const res = await axios.get('https://servers.fmdx.org/api/', {
        timeout: 10000,
        headers: { 'User-Agent': `fm-dx-console/${app.getVersion()}` }
      });
      console.log('Sending server list to renderer:', res.data.dataset?.length);
      sendToRenderer('server-list-data', res.data);
    } catch (err) {
      console.error('Failed to fetch server list:', err.message);
      sendToRenderer('server-list-data', { dataset: [] });
    }
  });
  win.removeMenu();

  const userAgent = `fm-dx-console/${app.getVersion()}`;
  function connectWebSocket(url) {
    if (ws) ws.close();
    if (!url) return;
    const wsAddr = socketEndpoint(url, 'text');
    const opts = { headers: { 'User-Agent': `${userAgent} (control)` } };
    ws = new WebSocket(wsAddr, opts);
    ws.on('open', () => {
      sendToRenderer('ws-connected', {});
    });
    ws.on('error', (err) => {
      console.error('WebSocket (control) error:', err.message);
      sendToRenderer('ws-error', { type: 'control', message: err.message });
    });
    ws.on('message', (data) => {
      sendToRenderer('ws-data', data.toString());
    });
  }

  function connectPluginWebSocket(url) {
    if (pluginWs) pluginWs.close();
    if (!url) return;
    const wsAddr = socketEndpoint(url, 'data_plugins');
    const opts = { headers: { 'User-Agent': `${userAgent} (plugin)` } };
    pluginWs = new WebSocket(wsAddr, opts);
    pluginWs.on('error', (err) => {
      console.error('WebSocket (plugin) error:', err.message);
    });
  }

  connectWebSocket(currentUrl);
  connectPluginWebSocket(currentUrl);

  // RDS advanced — throttled to keep IPC + renderer paint from drowning out
  // audio decoding when /rds bursts at >100 msgs/sec on strong signals.
  let rdsAdvancedDirty = false;
  let rdsAdvancedTimer = null;
  const RDS_ADVANCED_INTERVAL_MS = 100;

  function buildRdsAdvancedPayload() {
    return {
      state: rdsDecoder.getState(),
      ptyName: rdsDecoder.getPtyName(),
      ps: rdsDecoder.getPs(),
      longPs: rdsDecoder.getLongPs(),
      ptyn: rdsDecoder.getPtyn(),
      rt: rdsDecoder.getRt(),
      rtA: rdsDecoder.getRtA(),
      rtB: rdsDecoder.getRtB(),
      rtAbFlag: rdsDecoder.getRtAbFlag(),
      psStable: rdsDecoder.getPsStable(),
      longPsStable: rdsDecoder.getLongPsStable(),
      rtStable: rdsDecoder.getRtStable(),
      afList: rdsDecoder.getAfList(),
      groupStats: rdsDecoder.getGroupStats(),
      stableFlags: rdsDecoder.getStableFlags(),
      rtPlusData: rdsDecoder.getRtPlusData(),
      eonData: rdsDecoder.getEonData(),
      ber: rdsDecoder.getBer()
    };
  }

  function scheduleRdsAdvanced() {
    rdsAdvancedDirty = true;
    if (rdsAdvancedTimer) return;
    rdsAdvancedTimer = setTimeout(() => {
      rdsAdvancedTimer = null;
      if (!rdsAdvancedDirty) return;
      rdsAdvancedDirty = false;
      sendToRenderer('rds-advanced', buildRdsAdvancedPayload());
    }, RDS_ADVANCED_INTERVAL_MS);
  }

  function connectRdsWebSocket(url) {
    if (rdsWs) rdsWs.close();
    if (!url) return;
    const wsAddr = socketEndpoint(url, 'rds');
    const opts = { headers: { 'User-Agent': `${userAgent} (rds)` } };
    rdsWs = new WebSocket(wsAddr, opts);
    rdsWs.on('message', (data) => {
      rdsDecoder.parseMessage(data.toString());
      scheduleRdsAdvanced();
    });
    rdsWs.on('error', (err) => console.error('RDS WS error:', err.message));
  }

  connectRdsWebSocket(currentUrl);

  ipcMain.handle('get-audio-stream-url', () => {
    if (!currentUrl) return null;
    return socketEndpoint(currentUrl, 'audio');
  });

  ipcMain.handle('get-tuner-info', async (_e, url) => {
    try {
      return await getTunerInfo(url);
    } catch {
      return null;
    }
  });

  ipcMain.handle('set-url', async (_e, url) => {
    console.log('set-url called with:', url);
    const normalizedUrl = normalizeServerUrl(url);
    console.log('Normalized URL:', normalizedUrl);
    currentUrl = await resolveUrl(normalizedUrl);
    console.log('Resolved URL:', currentUrl);
    // Reset RDS decoder for new server
    rdsDecoder = createRdsDecoder();
    connectWebSocket(currentUrl);
    connectPluginWebSocket(currentUrl);
    connectRdsWebSocket(currentUrl);
    sendToRenderer('init-args', { url: currentUrl, version: app.getVersion() });
    console.log('set-url completed');
  });

  ipcMain.handle('disconnect', async () => {
    console.log('Disconnect called');
    currentUrl = null;
    if (ws) { ws.close(); ws = null; }
    if (pluginWs) { pluginWs.close(); pluginWs = null; }
    if (rdsWs) { rdsWs.close(); rdsWs = null; }
    sendToRenderer('disconnected', {});
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
      u.pathname = u.pathname.replace(/\/$/, '') + '/spectrum-graph-plugin';
      const res = await axios.get(u.toString(), {
        headers: { 'X-Plugin-Name': 'SpectrumGraphPlugin' }
      });
      return res.data;
    } catch {
      return null;
    }
  });

  ipcMain.handle('get-server-list', async () => {
    try {
      const res = await axios.get('https://servers.fmdx.org/api/', {
        timeout: 10000,
        headers: {
          'User-Agent': `fm-dx-console/${app.getVersion()}`
        }
      });
      console.log('Server list fetched:', res.data.dataset?.length || 0, 'servers');
      return res.data;
    } catch (err) {
      console.error('Failed to fetch server list:', err.message);
      return { dataset: [] };
    }
  });

  ipcMain.handle('start-spectrum-scan', () => {
    if (pluginWs && pluginWs.readyState === WebSocket.OPEN) {
      const msg = JSON.stringify({
        type: 'spectrum-graph',
        action: 'scan',
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
  if (ws) { ws.close(); ws = null; }
  if (pluginWs) { pluginWs.close(); pluginWs = null; }
  if (rdsWs) { rdsWs.close(); rdsWs = null; }
  app.quit();
});
