let ws;
let args;
let currentData;
let audioPlaying = false;

function formatWebSocketURL(url) {
  if (!url) return '';
  if (url.endsWith('/')) url = url.slice(0, -1);
  if (url.startsWith('http://')) return url.replace('http://', 'ws://');
  if (url.startsWith('https://')) return url.replace('https://', 'wss://');
  return url;
}

function convertToFrequency(num) {
  if (num === null || num === undefined) return null;
  num = parseFloat(num);
  while (num >= 100) num /= 10;
  if (num < 76) num *= 10;
  return Math.round(num * 10) / 10;
}

function connect() {
  if (!args.url) return;
  const wsAddr = `${formatWebSocketURL(args.url)}/text`;
  ws = new WebSocket(wsAddr);
  ws.onmessage = (evt) => {
    try {
      const data = JSON.parse(evt.data);
      currentData = data;
      updateUI();
    } catch (err) {
      console.error(err);
    }
  };
}

function sendCmd(cmd) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(cmd);
  }
}

electronAPI.onInitArgs((a) => {
  args = a;
  connect();
  startPing();
});

function updateUI() {
  if (!currentData) return;
  const freqSpan = document.getElementById('freq-display');
  if (currentData.freq) {
    freqSpan.textContent = `${currentData.freq.toFixed(1)} MHz`;
  }
  const rds = document.getElementById('rds-info');
  if (currentData.ps) {
    rds.textContent = `PS: ${currentData.ps}  PI: ${currentData.pi || ''}`;
  }
  const rt = document.getElementById('rt-info');
  if (currentData.rt0 || currentData.rt1) {
    rt.textContent = `${currentData.rt0 || ''} ${currentData.rt1 || ''}`;
  }
  const stats = document.getElementById('stats');
  if (currentData.users !== undefined) {
    stats.textContent = `Users: ${currentData.users}`;
  }
  const server = document.getElementById('server-info');
  if (currentData.txInfo && currentData.txInfo.tx) {
    server.textContent = `${currentData.txInfo.tx} - ${currentData.txInfo.city || ''}`;
  }
}

function doTune(delta) {
  if (currentData && currentData.freq) {
    sendCmd(`T${(currentData.freq * 1000) + delta}`);
  }
}

document.getElementById('up1').onclick = () => doTune(1000);
document.getElementById('down1').onclick = () => doTune(-1000);
document.getElementById('up01').onclick = () => doTune(100);
document.getElementById('down01').onclick = () => doTune(-100);
document.getElementById('up001').onclick = () => doTune(10);
document.getElementById('down001').onclick = () => doTune(-10);

document.getElementById('play-btn').onclick = async () => {
  if (audioPlaying) {
    await electronAPI.stopAudio();
    document.getElementById('play-btn').textContent = 'Play';
  } else {
    await electronAPI.startAudio();
    document.getElementById('play-btn').textContent = 'Stop';
  }
  audioPlaying = !audioPlaying;
};

async function startPing() {
  if (!args || !args.url) return;
  const pingUrl = new URL(args.url);
  pingUrl.pathname += 'ping';
  const stats = document.getElementById('stats');
  setInterval(async () => {
    try {
      const start = Date.now();
      await fetch(pingUrl.toString());
      const ms = Date.now() - start;
      stats.textContent = `Users: ${currentData ? currentData.users : ''} Ping: ${ms} ms`;
    } catch (e) {
      // ignore
    }
  }, 5000);
}
