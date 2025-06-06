let args;
let currentData;
let audioPlaying = false;
let antNames = [];
let lastPing = null;

const freqInputEl = document.getElementById('freq-input');

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
  args = a;
  startPing();
  if (args.url) {
    electronAPI.getTunerInfo(args.url).then(info => {
      if (info) {
        antNames = info.antNames || [];
        const srv = document.getElementById('server-info');
        srv.textContent = `${info.tunerName} - ${info.tunerDesc}`;
      }
    });
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
  if (currentData.rt0 || currentData.rt1) {
    rt.textContent = `${currentData.rt0 || ''} ${currentData.rt1 || ''}`;
  } else {
    rt.textContent = '';
  }

  const station = document.getElementById('station-info');
  if (currentData.txInfo && currentData.txInfo.tx) {
    station.textContent =
      `Name: ${currentData.txInfo.tx}\n` +
      `Location: ${currentData.txInfo.city}, ${currentData.txInfo.itu}\n` +
      `Distance: ${currentData.txInfo.dist} km\n` +
      `Power: ${currentData.txInfo.erp} kW [${currentData.txInfo.pol}]\n` +
      `Azimuth: ${currentData.txInfo.azi}\u00B0`;
  } else {
    station.textContent = '';
  }

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
document.getElementById('up0001').onclick = () => doTune(1);
document.getElementById('down0001').onclick = () => doTune(-1);
document.getElementById('refresh-btn').onclick = () => {
  if (currentData && currentData.freq !== undefined) {
    const freq = parseFloat(currentData.freq);
    if (!isNaN(freq)) {
      sendCmd(`T${freq * 1000}`);
    }
  }
};
document.getElementById('set-btn').onclick = () => {
  const value = freqInputEl.value;
  const f = convertToFrequency(value);
  if (!isNaN(f)) {
    sendCmd(`T${f * 1000}`);
  }
};
freqInputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    document.getElementById('set-btn').click();
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

async function startPing() {
  if (!args || !args.url) return;
  const pingUrl = new URL(args.url);
  pingUrl.pathname += 'ping';
  setInterval(async () => {
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
