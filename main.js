const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const pty = require('node-pty');

let ptyProcess;

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile('index.html');
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

ipcMain.on('start-console', (event) => {
  if (ptyProcess) {
    return;
  }
  const args = process.argv.slice(2);
  ptyProcess = pty.spawn(process.execPath, [path.join(__dirname, 'fm-dx-console.js'), ...args], {
    name: 'xterm-color',
    cols: 80,
    rows: 30,
    cwd: process.cwd(),
    env: process.env
  });
  ptyProcess.onData((data) => {
    event.sender.send('pty-data', data);
  });
});

ipcMain.on('pty-input', (event, data) => {
  if (ptyProcess) {
    ptyProcess.write(data);
  }
});
