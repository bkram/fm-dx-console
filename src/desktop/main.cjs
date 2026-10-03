const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const minimist = require('minimist');

const argv = minimist(process.argv.slice(app.isPackaged ? 1 : 2), {
  string: ['url'], boolean: ['dev', 'debug', 'sandbox', 'help', 'auto-play'], default: { sandbox: true }
});
if (argv.help) {
  console.log('Usage: fm-dx-console-gui [--url <fm-dx>] [--auto-play] [--dev] [--no-sandbox]');
  process.exit(0);
}
if (!argv.sandbox || (process.getuid && process.getuid() === 0)) app.commandLine.appendSwitch('no-sandbox');

let window;
let receiver;
let settings;
let shutdown = false;
const rendererErrors = [];

function send(channel, data) {
  if (window && !window.isDestroyed()) window.webContents.send(channel, data);
}

function handle(channel, callback) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
      throw new Error('Untrusted IPC sender');
    }
    return callback(...args);
  });
}

function createWindow() {
  window = new BrowserWindow({
    width: 1200, height: 900, minWidth: 800, minHeight: 600,
    autoHideMenuBar: true, backgroundColor: '#18181b',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true,
      nodeIntegration: false, sandbox: true, devTools: true }
  });
  window.removeMenu();
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('console-message', details => {
    if (details.level === 'error') rendererErrors.push(details.message);
    if (argv.debug || argv.dev) console.log('[renderer]', details.message);
  });
  window.webContents.on('render-process-gone', (_event, details) => console.error('Renderer stopped:', details.reason));
  window.on('closed', () => { window = null; receiver.disconnect(); });
  if (argv.dev) window.webContents.openDevTools();
  if (process.env.FM_DX_SMOKE_REPORT) {
    window.webContents.once('did-finish-load', async () => {
      try {
        const report = await require('./smoke.cjs').checkWindow(window, {
          server: process.env.FM_DX_SMOKE_SERVER, switchServer: process.env.FM_DX_SMOKE_SWITCH_SERVER,
          version: app.getVersion(), rendererErrors, receiver
        });
        receiver.disconnect();
        await settings.flush();
        require('node:fs').writeFileSync(process.env.FM_DX_SMOKE_REPORT, JSON.stringify(report));
        app.exit(0);
      } catch (error) { console.error('GUI smoke test:', error); app.exit(1); }
    });
  }
  window.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(async () => {
  const [{ Receiver }, config, { normalizeUrl }, { fetchServers }] = await Promise.all([
    import('../lib/receiver.js'), import('../lib/config.js'), import('../lib/urls.js'), import('../lib/servers.js')
  ]);
  const initialUrl = argv.url ? normalizeUrl(argv.url) : '';
  settings = process.env.FM_DX_SMOKE_REPORT
    ? config.createConfigStore(path.join(path.dirname(process.env.FM_DX_SMOKE_REPORT), 'settings.json'))
    : config.defaultSettings;
  const userAgent = `fm-dx-console/${app.getVersion()}`;
  receiver = new Receiver({ settings, spectrum: true, userAgent, debug: argv.debug,
    rdsWorkerPath: app.isPackaged ? path.join(process.resourcesPath, 'app.asar.unpacked/src/workers/rds.cjs') : undefined });
  // Presentation adapter only. All receiver behavior is shared with the CLI.
  receiver.on('connecting', url => send('init-args', { url }));
  receiver.on('open', () => send('ws-connected', {}));
  receiver.on('data', data => send('ws-data', JSON.stringify(data)));
  receiver.on('rds-advanced', data => send('rds-advanced', data));
  receiver.on('tunerinfo', info => send('tuner-info', info));
  receiver.on('ping', ping => send('ping', ping));
  receiver.on('settings', value => send('settings', value));
  receiver.on('reconnecting', info => send('ws-reconnecting', info));
  receiver.on('error', error => send('ws-error', { message: error.message }));
  receiver.on('disconnected', () => send('disconnected', {}));
  handle('get-initial-state', () => ({ version: app.getVersion(), url: initialUrl,
    autoPlay: argv['auto-play'], ...settings.load() }));
  handle('set-url', value => receiver.connect(value));
  handle('disconnect', () => receiver.disconnect());
  handle('tuner-action', (type, value) => receiver.action(type, value));
  handle('get-tuner-info', () => receiver.tunerInfo);
  handle('get-audio-stream-url', () => receiver.audioUrl());
  handle('get-spectrum-data', () => receiver.spectrum());
  handle('start-spectrum-scan', () => receiver.scanSpectrum());
  handle('get-server-list', async () => ({ dataset: await fetchServers({ userAgent }) }));
  handle('save-signal-unit', unit => {
    if (!['dBf', 'dBuV', 'dBm'].includes(unit)) throw new Error('Invalid signal unit');
    settings.save({ signalUnit: unit }); send('settings', settings.load());
  });
  createWindow();
  app.on('activate', () => { if (!window) createWindow(); });
}).catch(error => { console.error('Desktop startup failed:', error); app.quit(); });

app.on('before-quit', event => {
  if (shutdown || !settings) return;
  event.preventDefault();
  shutdown = true;
  receiver?.disconnect();
  settings.flush().finally(() => app.quit());
});
app.on('window-all-closed', () => app.quit());
