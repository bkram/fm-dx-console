let args;
let currentData;
let audioPlaying = false;
let antNames = [];
let lastPing = null;
let currentUrl = '';
let pingTimer = null;

const freqInputEl = document.getElementById('freq-input');
const urlInputEl = document.getElementById('url-input');

const europe_programmes = [
  'No PTY', 'News', 'Current Affairs', 'Info', 'Sport', 'Education', 'Drama',
  'Culture', 'Science', 'Varied', 'Pop M', 'Rock M', 'Easy Listening',
  'Light Classical', 'Serious Classical', 'Other Music', 'Weather', 'Finance',
  "Children's Programmes", 'Social Affairs', 'Religion', 'Phone-in', 'Travel',
  'Leisure', 'Jazz Music', 'Country Music', 'National Music', 'Oldies Music',
  'Folk Music', 'Documentary', 'Alarm Test'
];

function convertToFrequency(num) {
  if (num === null || num === undefined) return null;
  num = parseFloat(num);
  while (num >= 100) num /= 10;
  if (num < 76) num *= 10;
  return Math.round(num * 1000) / 1000;
}


function sendCmd(cmd) {
  electronAPI.sendCommand(cmd);
}

electronAPI.onInitArgs((a) => {
  args = Object.assign({}, args, a);
  if (a.url !== undefined) {
    currentUrl = a.url;
    urlInputEl.value = currentUrl || '';
    startPing();
    if (currentUrl) {
      electronAPI.getTunerInfo(currentUrl).then(info => {
        if (info) {
          antNames = info.antNames || [];
          const srv = document.getElementById('server-info');
          srv.textContent = `${info.tunerName}\n${info.tunerDesc}`;
        }
      });
    }
  }
});

electronAPI.onWsData((data) => {
  try {
    currentData = JSON.parse(data);
    updateUI();
  } catch (err) {
    console.error(err);
  }
});

electronAPI.onAudioStopped(() => {
  audioPlaying = false;
  document.getElementById('play-btn').textContent = 'play_arrow';
  updateStatus();
});

function updateUI() {
  if (!currentData) return;
  if (currentData.freq !== undefined && currentData.freq !== null) {
    const freq = parseFloat(currentData.freq);
    if (!isNaN(freq) && document.activeElement !== freqInputEl) {
      freqInputEl.value = freq.toFixed(3);
    }
  }
  const signal = document.getElementById('signal');
  const signalLabel = document.getElementById('signal-label');
  if (currentData.sig !== undefined) {
    const sig = parseFloat(currentData.sig);
    if (!isNaN(sig)) {
      signal.value = scaleValue(sig);
      signalLabel.textContent = `${sig.toFixed(1)} dBf`;
    }
  }

  const tuner = document.getElementById('tuner-info');
  const ant = antNames[currentData.ant] || currentData.ant;
  tuner.textContent =
    `Mode: ${currentData.st ? 'Stereo' : 'Mono'}\n` +
    `iMS: ${currentData.ims ? 'On' : 'Off'}\n` +
    `EQ: ${currentData.eq ? 'On' : 'Off'}\n` +
    `ANT: ${ant}`;

  const rds = document.getElementById('rds-info');
  if (currentData.ps) {
    const flags = `${currentData.tp ? 'TP ' : ''}${currentData.ta ? 'TA ' : ''}${currentData.ms ? 'MS' : ''}`;
    const pty = currentData.pty ? europe_programmes[currentData.pty] : '';
    rds.textContent = `PS: ${currentData.ps}  PI: ${currentData.pi || ''}\n${flags}\n${pty}`;
  } else {
    rds.textContent = '';
  }

  const rt = document.getElementById('rt-info');
  const line1 = currentData.rt1 ? currentData.rt1 : '\u00a0';
  const line2 = currentData.rt2 ? currentData.rt2 : '\u00a0';
  rt.textContent = `${line1}\n${line2}`;

  const station = document.getElementById('station-info');
  const tx = currentData.txInfo && currentData.txInfo.tx ? currentData.txInfo : null;
  station.textContent =
    `Name: ${tx ? tx.tx : ''}\n` +
    `Location: ${tx ? `${tx.city}, ${tx.itu}` : ''}\n` +
    `Distance: ${tx ? `${tx.dist} km` : ''}\n` +
    `Power: ${tx ? `${tx.erp} kW [${tx.pol}]` : ''}\n` +
    `Azimuth: ${tx ? `${tx.azi}\u00B0` : ''}`;

  updateStatus();
}

function updateStatus() {
  const statsEl = document.getElementById('stats');
  const users = currentData && currentData.users !== undefined ? currentData.users : '';
  const ping = lastPing !== null ? `${lastPing} ms` : '';
  statsEl.textContent = `Users: ${users}\nPing: ${ping}\nAudio: ${audioPlaying ? 'Playing' : 'Stopped'}`;
}

function scaleValue(value) {
  const maxvalue = 130;
  value = Math.max(0, Math.min(maxvalue, value));
  return Math.floor((value / maxvalue) * 100);
}

function doTune(delta) {
  if (currentData && currentData.freq !== undefined) {
    const freq = parseFloat(currentData.freq);
    if (!isNaN(freq)) {
      sendCmd(`T${(freq * 1000) + delta}`);
    }
  }
}

document.getElementById('up1').onclick = () => doTune(1000);
document.getElementById('down1').onclick = () => doTune(-1000);
document.getElementById('up01').onclick = () => doTune(100);
document.getElementById('down01').onclick = () => doTune(-100);
document.getElementById('up001').onclick = () => doTune(10);
document.getElementById('down001').onclick = () => doTune(-10);
document.getElementById('refresh-btn').onclick = () => {
  if (currentData && currentData.freq !== undefined) {
    const freq = parseFloat(currentData.freq);
    if (!isNaN(freq)) {
      sendCmd(`T${freq * 1000}`);
    }
  }
};
freqInputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const f = convertToFrequency(freqInputEl.value);
    if (!isNaN(f)) {
      sendCmd(`T${f * 1000}`);
      freqInputEl.blur();
    }
  } else if (!/[0-9.,]/.test(e.key) &&
             !['Backspace','Delete','ArrowLeft','ArrowRight','Home','End','Tab'].includes(e.key)) {
    e.preventDefault();
  }
});

document.getElementById('url-btn').onclick = setBackendUrl;
urlInputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    setBackendUrl();
  }
});
document.getElementById('ims-btn').onclick = () => {
  if (currentData) {
    const cmd = currentData.ims == 1 ? `G${currentData.eq}0` : `G${currentData.eq}1`;
    sendCmd(cmd);
  }
};
document.getElementById('eq-btn').onclick = () => {
  if (currentData) {
    const cmd = currentData.eq == 1 ? `G0${currentData.ims}` : `G1${currentData.ims}`;
    sendCmd(cmd);
  }
};
document.getElementById('ant-btn').onclick = () => {
  if (currentData) {
    let newAnt = parseInt(currentData.ant) + 1;
    if (antNames.length && newAnt >= antNames.length) newAnt = 0;
    sendCmd(`Z${newAnt}`);
  }
};

let scanning = false;
let spectrumData = [];
document.getElementById('scan-btn').onclick = runSpectrumScan;

document.getElementById('play-btn').onclick = async () => {
  if (audioPlaying) {
    await electronAPI.stopAudio();
    document.getElementById('play-btn').textContent = 'play_arrow';
  } else {
    await electronAPI.startAudio();
    document.getElementById('play-btn').textContent = 'stop';
  }
  audioPlaying = !audioPlaying;
  if (currentData) updateUI();
};

document.addEventListener('keydown', (e) => {
  if (document.activeElement === freqInputEl) {
    if (e.key === 'Enter') return; // handled separately
    return;
  }
  if (document.activeElement === urlInputEl) {
    return;
  }
  switch (e.key) {
    case 'ArrowLeft':
      doTune(-100);
      break;
    case 'ArrowRight':
      doTune(100);
      break;
    case 'ArrowUp':
      doTune(10);
      break;
    case 'ArrowDown':
      doTune(-10);
      break;
    case 'x':
      doTune(1000);
      break;
    case 'z':
      doTune(-1000);
      break;
    case 'r':
      document.getElementById('refresh-btn').click();
      break;
    case 'p':
      document.getElementById('play-btn').click();
      break;
    case '[':
      document.getElementById('ims-btn').click();
      break;
    case ']':
      document.getElementById('eq-btn').click();
      break;
    case 'y':
      document.getElementById('ant-btn').click();
      break;
    case 't':
      e.preventDefault();
      freqInputEl.focus();
      freqInputEl.select();
      break;
  }
});

async function startPing() {
  if (!currentUrl) return;
  const pingUrl = new URL(currentUrl);
  pingUrl.pathname += 'ping';
  if (pingTimer) clearInterval(pingTimer);
  pingTimer = setInterval(async () => {
    try {
      const start = Date.now();
      await fetch(pingUrl.toString());
      lastPing = Date.now() - start;
      updateStatus();
    } catch (e) {
      // ignore
    }
  }, 5000);
}

async function runSpectrumScan() {
  if (scanning) return;
  scanning = true;
  const canvas = document.getElementById('spectrum-canvas');
  const ctx = canvas.getContext('2d');
  const points = [];

  const origFreq = currentData && currentData.freq !== undefined ? parseFloat(currentData.freq) : null;
  const wasPlaying = audioPlaying;
  if (wasPlaying) {
    await electronAPI.stopAudio();
    document.getElementById('play-btn').textContent = 'play_arrow';
    audioPlaying = false;
    updateStatus();
  }

  for (let f = 83.0; f <= 108.0; f += 0.05) {
    sendCmd(`T${Math.round(f * 1000)}`);
    await new Promise(r => setTimeout(r, 150));
    const sig = currentData && currentData.sig !== undefined ? parseFloat(currentData.sig) : 0;
    points.push({ freq: f, sig: isNaN(sig) ? 0 : sig });
    spectrumData = points;
    drawSpectrum(ctx, canvas, spectrumData);
  }

  if (origFreq !== null) {
    sendCmd(`T${Math.round(origFreq * 1000)}`);
    await new Promise(r => setTimeout(r, 300));
  }

  if (wasPlaying) {
    await electronAPI.startAudio();
    document.getElementById('play-btn').textContent = 'stop';
    audioPlaying = true;
    updateStatus();
  }

  scanning = false;
}

document.getElementById('spectrum-canvas').addEventListener('click', (e) => {
  if (!spectrumData.length) return;
  const canvas = e.currentTarget;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const idx = Math.round(x / rect.width * (spectrumData.length - 1));
  const freq = spectrumData[Math.max(0, Math.min(idx, spectrumData.length - 1))].freq;
  sendCmd(`T${Math.round(freq * 1000)}`);
});

function drawSpectrum(ctx, canvas, points) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#0f0';
  ctx.beginPath();
  const max = 130;
  const stepX = canvas.width / (points.length - 1);
  points.forEach((p, i) => {
    const x = i * stepX;
    const y = canvas.height - (Math.min(max, p.sig) / max) * canvas.height;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

async function setBackendUrl() {
  const url = urlInputEl.value.trim();
  const wasPlaying = audioPlaying;
  if (audioPlaying) {
    await electronAPI.stopAudio();
    audioPlaying = false;
    document.getElementById('play-btn').textContent = 'play_arrow';
  }
  currentUrl = url;
  await electronAPI.setUrl(url);
  startPing();
  if (url) {
    electronAPI.getTunerInfo(url).then(info => {
      const srv = document.getElementById('server-info');
      if (info) {
        antNames = info.antNames || [];
        srv.textContent = `${info.tunerName}\n${info.tunerDesc}`;
      } else {
        srv.textContent = '';
      }
    });
  }
  if (wasPlaying) {
    await electronAPI.startAudio();
    audioPlaying = true;
    document.getElementById('play-btn').textContent = 'stop';
  }
  updateStatus();
}
