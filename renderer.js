let args;
let currentData;
let audioPlaying = false;
let antNames = [];
let lastPing = null;
let currentUrl = '';
let pingTimer = null;

const freqInputEl = document.getElementById('freq-input');
const urlInputEl = document.getElementById('url-input');
const unitSelectEl = document.getElementById('signal-unit-select');

const savedUnit = localStorage.getItem('signalUnit');
if (savedUnit) {
  unitSelectEl.value = savedUnit;
}
unitSelectEl.addEventListener('change', () => {
  localStorage.setItem('signalUnit', unitSelectEl.value);
  if (currentData) updateUI();
});

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

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function processStringWithErrors(str, errors) {
  if (!str) return '';
  const errArr = (errors || '').split(',').map(e => parseInt(e, 10) || 0);
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const ch = escapeHtml(str[i]);
    if (errArr[i] > 0) {
      out += `<span class="text-gray">${ch}</span>`;
    } else {
      out += ch;
    }
  }
  return out;
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
      fetchSpectrumData();
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
    if (!isNaN(freq) && document.activeElement !== freqInputEl && !dragging) {
      freqInputEl.value = freq.toFixed(3);
    }
  }
  const signal = document.getElementById('signal');
  const signalLabel = document.getElementById('signal-label');
  if (currentData.sig !== undefined) {
    const sig = parseFloat(currentData.sig);
    if (!isNaN(sig)) {
      signal.value = scaleValue(sig);
      let disp = sig;
      let unit = 'dBf';
      switch (unitSelectEl.value) {
        case 'dbuv':
          disp = sig - 11.25;
          unit = 'dBµV';
          break;
        case 'dbm':
          disp = sig - 120;
          unit = 'dBm';
          break;
      }
      signalLabel.textContent = `${disp.toFixed(1)} ${unit}`;
    }
  }

  const tuner = document.getElementById('tuner-info');
  let ant;
  if (antNames.length === 0) {
    ant = 'Default';
  } else {
    ant = antNames[currentData.ant] || antNames[0] || currentData.ant;
  }
  tuner.textContent =
    `Mode: ${currentData.st ? 'Stereo' : 'Mono'}\n` +
    `iMS: ${currentData.ims ? 'On' : 'Off'}\n` +
    `EQ: ${currentData.eq ? 'On' : 'Off'}\n` +
    `ANT: ${ant}`;

  const rds = document.getElementById('rds-info');
  const flags = `${currentData.tp ? 'TP ' : ''}${currentData.ta ? 'TA ' : ''}${currentData.ms ? 'MS' : ''}`.trim();
  const ptyNum = currentData.pty !== undefined ? currentData.pty : 0;
  const ptyName = europe_programmes[ptyNum] || 'None';
  const psDisplay = processStringWithErrors(currentData.ps || '', currentData.ps_errors);
  const pi = currentData.pi || '';
  let rdsText = `PS: ${psDisplay}\nPI: ${pi}`;
  if (currentData.ecc) {
    rdsText += `\nECC: ${currentData.ecc}`;
  }
  let country = currentData.country_name || currentData.country_iso;
  if (country) {
    if (country === 'UN') country = 'None';
    rdsText += `\nCountry: ${country}`;
  }
  if (flags) {
    rdsText += `\nFlags: ${flags}`;
  }
  rdsText += `\nPTY: ${ptyNum}/${ptyName}`;
  if (
    currentData.dynamic_pty !== undefined ||
    currentData.artificial_head !== undefined ||
    currentData.compressed !== undefined
  ) {
    rdsText +=
      `\nDI: ` +
      `DP:${currentData.dynamic_pty ? 'On' : 'Off'} ` +
      `AH:${currentData.artificial_head ? 'On' : 'Off'} ` +
      `C:${currentData.compressed ? 'On' : 'Off'} ` +
      `Stereo:${currentData.st ? 'Yes' : 'No'}`;
  }
  if (Array.isArray(currentData.af)) {
    if (currentData.af.length) {
      rdsText += `\nAF: ${currentData.af.length} frequencies detected`;
    } else {
      rdsText += `\nAF: None`;
    }
  } else {
    rdsText += `\nAF: None`;
  }
  rds.innerHTML = rdsText.replace(/\n/g, '<br>');

  const rt = document.getElementById('rt-info');
  const line1 = processStringWithErrors(currentData.rt0 || '\u00a0', currentData.rt0_errors);
  const line2 = processStringWithErrors(currentData.rt1 || '\u00a0', currentData.rt1_errors);
  rt.innerHTML = `${line1}<br>${line2}`;

  const station = document.getElementById('station-info');
  const tx = currentData.txInfo && currentData.txInfo.tx ? currentData.txInfo : null;
  station.textContent =
    `Name: ${tx ? tx.tx : ''}\n` +
    `Location: ${tx ? `${tx.city}, ${tx.itu}` : ''}\n` +
    `Distance: ${tx ? `${tx.dist} km` : ''}\n` +
    `Power: ${tx ? `${tx.erp} kW [${tx.pol}]` : ''}\n` +
    `Azimuth: ${tx ? `${tx.azi}\u00B0` : ''}`;

  const canvas = document.getElementById('spectrum-canvas');
  const ctx = canvas.getContext('2d');
  drawSpectrum(ctx, canvas, spectrumData, parseFloat(freqInputEl.value));

  updateStatus();
}

function updateStatus() {
  const statsEl = document.getElementById('stats');
  const users = currentData && currentData.users !== undefined ? currentData.users : '';
  const ping = lastPing !== null ? `${lastPing} ms` : '';
  statsEl.textContent = `Users: ${users}\nPing: ${ping}\nAudio: ${audioPlaying ? 'Playing' : 'Stopped'}`;
}

function resetRdsUI() {
  document.getElementById('rds-info').textContent = '';
  document.getElementById('rt-info').textContent = '\u00a0\n\u00a0';
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
      resetRdsUI();
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
      resetRdsUI();
    }
  }
};
freqInputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const f = convertToFrequency(freqInputEl.value);
    if (!isNaN(f)) {
      sendCmd(`T${f * 1000}`);
      resetRdsUI();
      freqInputEl.blur();
    }
  } else if (!/[0-9.,]/.test(e.key) &&
             !['Backspace','Delete','ArrowLeft','ArrowRight','Home','End','Tab'].includes(e.key)) {
    e.preventDefault();
  }
});
freqInputEl.addEventListener('input', () => {
  const canvas = document.getElementById('spectrum-canvas');
  const ctx = canvas.getContext('2d');
  drawSpectrum(ctx, canvas, spectrumData, parseFloat(freqInputEl.value));
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
    const count = Math.max(antNames.length, 1);
    if (newAnt >= count) newAnt = 0;
    sendCmd(`Z${newAnt}`);
    fetchSpectrumData();
  }
};

let scanning = false;
let spectrumData = [];
document.getElementById('scan-btn').onclick = runSpectrumScan;

async function fetchSpectrumData() {
  if (!currentUrl) return false;
  const data = await electronAPI.getSpectrumData();
  const canvas = document.getElementById('spectrum-canvas');
  const ctx = canvas.getContext('2d');
  if (data) {
    let sd = data.sd;
    if (!sd && data.ad !== undefined && data[`sd${data.ad}`]) {
      sd = data[`sd${data.ad}`];
    }
    if (sd) {
      spectrumData = sd.split(',').map(pair => {
        const [f, s] = pair.split('=');
        return { freq: parseFloat((parseFloat(f) / 1000).toFixed(2)), sig: parseFloat(s) };
      });
      drawSpectrum(ctx, canvas, spectrumData, parseFloat(freqInputEl.value));
      return true;
    }
  }
  if (!spectrumData.length) {
    for (let f = 83.0; f <= 108.0; f += 0.05) {
      spectrumData.push({ freq: parseFloat(f.toFixed(2)), sig: 0 });
    }
  }
  drawSpectrum(ctx, canvas, spectrumData, parseFloat(freqInputEl.value));
  return false;
}

window.addEventListener('DOMContentLoaded', fetchSpectrumData);

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
  spectrumData = [];
  drawSpectrum(ctx, canvas, spectrumData, parseFloat(freqInputEl.value));

  await electronAPI.startSpectrumScan();
  const endTime = Date.now() + 10000;
  let gotData = false;
  while (Date.now() < endTime) {
    await new Promise(r => setTimeout(r, 500));
    gotData = await fetchSpectrumData();
    if (gotData) break;
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
  const rounded = Math.round(freq * 10) / 10; // tune in 0.1 MHz steps
  sendCmd(`T${Math.round(rounded * 1000)}`);
  resetRdsUI();
});

let dragging = false;

function handleDrag(e, final = false) {
  const canvas = document.getElementById('spectrum-canvas');
  const rect = canvas.getBoundingClientRect();
  let x = e.clientX - rect.left;
  x = Math.max(0, Math.min(x, rect.width));

  const startFreq = spectrumData.length ? spectrumData[0].freq : 83;
  const endFreq = spectrumData.length ? spectrumData[spectrumData.length - 1].freq : 108;
  const frac = x / rect.width;
  const freq = startFreq + frac * (endFreq - startFreq);
  const rounded = Math.round(freq * 10) / 10; // 0.1 MHz resolution

  const ctx = canvas.getContext('2d');

  if (final) {
    freqInputEl.value = rounded.toFixed(1);
    drawSpectrum(ctx, canvas, spectrumData, rounded);
    sendCmd(`T${Math.round(rounded * 1000)}`);
    resetRdsUI();
  } else {
    freqInputEl.value = rounded.toFixed(1);
    drawSpectrum(ctx, canvas, spectrumData, rounded);
  }
}

const spectrumCanvas = document.getElementById('spectrum-canvas');
spectrumCanvas.addEventListener('mousedown', (e) => {
  if (!spectrumData.length) return;
  dragging = true;
  handleDrag(e);
});

window.addEventListener('mousemove', (e) => {
  if (dragging) {
    handleDrag(e);
  }
});

window.addEventListener('mouseup', (e) => {
  if (dragging) {
    dragging = false;
    handleDrag(e, true);
  }
});

function drawSpectrum(ctx, canvas, points, highlightFreq) {
  if (canvas.width !== canvas.clientWidth) {
    canvas.width = canvas.clientWidth;
  }
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const startFreq = points.length ? points[0].freq : 83;
  const endFreq = points.length ? points[points.length - 1].freq : 108;

  // draw grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 0.5;
  ctx.setLineDash([2, 4]);
  const max = 130;
  for (let s = 0; s <= max; s += 20) {
    const y = canvas.height - (s / max) * canvas.height + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
    ctx.fillStyle = '#bbb';
    ctx.fillText(s.toString(), 2, y - 2);
  }
  for (let f = Math.ceil(startFreq); f <= endFreq; f += 1) {
    const x = (f - startFreq) / (endFreq - startFreq) * canvas.width + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
    ctx.fillStyle = '#bbb';
    ctx.fillText(f.toString(), x + 2, canvas.height - 2);
  }
  ctx.setLineDash([]);

  const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
  gradient.addColorStop(0, '#0030E0');
  gradient.addColorStop(0.25, '#10C838');
  gradient.addColorStop(0.5, '#C0D000');
  gradient.addColorStop(0.75, '#FF0040');
  ctx.strokeStyle = gradient;
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 2;

  ctx.beginPath();
  if (points.length > 0) {
    const stepX = points.length > 1 ? canvas.width / (points.length - 1) : 0;
    points.forEach((p, i) => {
      const x = i * stepX;
      const y = canvas.height - (Math.min(max, p.sig) / max) * canvas.height;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(canvas.width, canvas.height);
    ctx.lineTo(0, canvas.height);
    ctx.closePath();
    ctx.fill();
  }
  ctx.stroke();

  if (highlightFreq !== undefined && !isNaN(highlightFreq)) {
    const hf = parseFloat(highlightFreq);
    if (hf >= startFreq && hf <= endFreq) {
      const x = (hf - startFreq) / (endFreq - startFreq) * canvas.width;
      ctx.fillStyle = 'rgba(255,255,0,0.4)';
      ctx.fillRect(x - 2, 0, 4, canvas.height);
    }
  }
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
    fetchSpectrumData();
  }
  if (wasPlaying) {
    await electronAPI.startAudio();
    audioPlaying = true;
    document.getElementById('play-btn').textContent = 'stop';
  }
  updateStatus();
}
