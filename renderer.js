let currentData;
let audioPlaying = false;
let antNames = [];
let lastPing = null;
let currentUrl = '';
let pingTimer = null;
let appVersion = '';
let rdsAdvanced = null;
let dragging = false;
let spectrumData = {};
let isConnected = false;
let spectrumRange = null;
let spectrumDragActive = false;
let spectrumLastTuneTime = 0;
let freqWheelLastTuneTime = 0;
let signalHistory = [];
const SIGNAL_HISTORY_MAX = 300;
let spectrumReloadTimer = null;

const EUROPE_PTY = [
  "No PTY", "News", "Current Affairs", "Info",
  "Sport", "Education", "Drama", "Culture", "Science", "Varied",
  "Pop Music", "Rock Music", "Easy Listening", "Light Classical",
  "Serious Classical", "Other Music", "Weather", "Finance",
  "Children's Programmes", "Social Affairs", "Religion", "Phone-in",
  "Travel", "Leisure", "Jazz Music", "Country Music", "National Music",
  "Oldies Music", "Folk Music", "Documentary", "Alarm Test", "Alarm"
];

// Audio player: WebSocket /audio (upstream's fallback-MP3 protocol) →
// MediaSource Extensions. Chromium decodes MP3 frames natively; we keep
// playback near the live edge by gently varying playbackRate. No hard seeks
// (they cause audible pops), no SourceBuffer.remove() (it races with append).
let audioPlayer = null;
const AUDIO_MIME = 'audio/mpeg';

function createAudioPlayer(wsUrl) {
  if (typeof MediaSource === 'undefined' || !MediaSource.isTypeSupported(AUDIO_MIME)) {
    console.error('MediaSource cannot decode', AUDIO_MIME);
    return null;
  }

  const player = {
    ws: null,
    mediaSource: new MediaSource(),
    sourceBuffer: null,
    queue: [],
    audio: new Audio(),
    objectUrl: null,
    stopped: false,
    started: false,
    rateTimer: null,
    bytesIn: 0,
    bytesPrev: 0,
    bytesAt: 0
  };

  player.audio.preload = 'auto';
  player.audio.autoplay = false;
  player.objectUrl = URL.createObjectURL(player.mediaSource);
  player.audio.src = player.objectUrl;

  const drain = () => {
    if (!player.sourceBuffer || player.sourceBuffer.updating) return;
    if (player.queue.length === 0) return;
    const chunk = player.queue.shift();
    try { player.sourceBuffer.appendBuffer(chunk); }
    catch (err) { console.warn('MSE append failed:', err.message); }
  };

  const setLcd = (id, text, dim) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('dim', !!dim);
  };

  // Gentle drift control + LCD live indicators (bitrate / buffer %).
  const tickRate = () => {
    if (!player.sourceBuffer || player.audio.paused) {
      setLcd('lcd-buffer', '— %', true);
      return;
    }

    // Bitrate from incoming byte rate.
    const now = performance.now();
    if (player.bytesAt && now - player.bytesAt >= 800) {
      const deltaBytes = player.bytesIn - player.bytesPrev;
      const deltaMs = now - player.bytesAt;
      const kbps = Math.round((deltaBytes * 8) / deltaMs);
      setLcd('lcd-bitrate', `${kbps} kbps`, kbps === 0);
      player.bytesPrev = player.bytesIn;
      player.bytesAt = now;
    }

    if (player.audio.buffered.length === 0) {
      setLcd('lcd-buffer', '0 %', false);
      return;
    }
    const end = player.audio.buffered.end(player.audio.buffered.length - 1);
    const behind = end - player.audio.currentTime;
    const raw = Math.max(0, Math.min(100, (behind / 2.0) * 100));
    // EMA smooths flicker as playbackRate nudges currentTime around.
    player.bufferEma = player.bufferEma == null ? raw : (player.bufferEma * 0.7 + raw * 0.3);
    setLcd('lcd-buffer', `${Math.round(player.bufferEma)} %`, false);

    if (behind > 2.5)      player.audio.playbackRate = 1.10;
    else if (behind > 1.2) player.audio.playbackRate = 1.04;
    else if (behind < 0.3) player.audio.playbackRate = 0.98;
    else                   player.audio.playbackRate = 1.00;
  };

  player.mediaSource.addEventListener('sourceopen', () => {
    if (player.sourceBuffer) return;
    try {
      player.sourceBuffer = player.mediaSource.addSourceBuffer(AUDIO_MIME);
      player.sourceBuffer.mode = 'sequence';
      player.sourceBuffer.addEventListener('updateend', drain);
    } catch (err) {
      console.error('MSE addSourceBuffer failed:', err);
      return;
    }
    drain();
    // Wait for enough buffer before starting play so we don't stall.
    player.audio.addEventListener('canplay', () => {
      if (player.stopped || player.started) return;
      player.started = true;
      player.audio.play()
        .then(() => { player.rateTimer = setInterval(tickRate, 500); })
        .catch(err => console.warn('Audio play failed:', err));
    }, { once: true });
  }, { once: true });

  player.ws = new WebSocket(wsUrl);
  player.ws.binaryType = 'arraybuffer';
  player.ws.onopen = () => {
    player.ws.send(JSON.stringify({ type: 'fallback', data: 'mp3' }));
  };
  player.ws.onmessage = (ev) => {
    if (player.stopped || !(ev.data instanceof ArrayBuffer)) return;
    player.bytesIn += ev.data.byteLength;
    if (!player.bytesAt) { player.bytesAt = performance.now(); player.bytesPrev = 0; }
    player.queue.push(new Uint8Array(ev.data));
    drain();
  };
  player.ws.onerror = (err) => console.warn('Audio WS error:', err);
  player.ws.onclose = () => {
    if (!player.stopped) {
      audioPlaying = false;
      if (playBtn) setPlayBtn(false);
      updateStatus();
    }
  };

  player.stop = () => {
    player.stopped = true;
    if (player.rateTimer) { clearInterval(player.rateTimer); player.rateTimer = null; }
    if (player.ws) {
      player.ws.onclose = null;
      try { player.ws.close(); } catch (_) {}
      player.ws = null;
    }
    player.queue = [];
    if (player.sourceBuffer && player.mediaSource.readyState === 'open') {
      try { player.sourceBuffer.abort(); } catch (_) {}
      try { player.mediaSource.endOfStream(); } catch (_) {}
    }
    if (player.audio) {
      player.audio.playbackRate = 1.0;
      player.audio.pause();
      player.audio.removeAttribute('src');
      player.audio.load();
    }
    if (player.objectUrl) URL.revokeObjectURL(player.objectUrl);
  };

  return player;
}

async function startAudioPlayback() {
  const url = await electronAPI.getAudioStreamUrl();
  if (!url) return;
  if (audioPlayer) audioPlayer.stop();
  audioPlayer = createAudioPlayer(url);
  audioPlaying = !!audioPlayer;
}

function stopAudioPlayback() {
  audioPlaying = false;
  if (audioPlayer) { audioPlayer.stop(); audioPlayer = null; }
}

console.log('FM DX Console renderer loaded');

// Expose function to window for onclick handlers
window.handleConnectBtnClick = function() {
  const url = document.getElementById('url-input').value.trim();
  console.log('handleConnectBtnClick called, url:', url);
  if (isConnected) {
    electronAPI.disconnect();
    return;
  }
  if (url) {
    localStorage.setItem('lastServer', url);
    cleanup();
    setConnectionStatus('Connecting...');
    currentUrl = url;
    console.log('Calling setUrl...');
    electronAPI.setUrl(url).then(() => {
      console.log('setUrl completed');
    }).catch(err => {
      console.error('setUrl failed:', err);
    });
  }
};

const freqInputEl = document.getElementById('freq-input');
const urlInputEl = document.getElementById('url-input');
const serverSelectEl = document.getElementById('server-select');
const unitSelectEl = document.getElementById('signal-unit-select');
const playBtn = document.getElementById('play-btn');
function setPlayBtn(playing) {
  if (!playBtn) return;
  playBtn.classList.toggle('playing', playing);
  playBtn.innerHTML = playing
    ? '<span class="material-icons">stop</span>Stop'
    : '<span class="material-icons">play_arrow</span>Play';
}

const savedUnit = localStorage.getItem('signalUnit');
if (savedUnit) {
  unitSelectEl.value = savedUnit;
}
unitSelectEl.addEventListener('change', () => {
  localStorage.setItem('signalUnit', unitSelectEl.value);
  if (currentData) updateUI();
});

const serverErrorEl = document.getElementById('server-error');

console.log('Renderer: Waiting for server list...');

let serverListPopulated = false;

function handleServerListData(data) {
  if (serverListPopulated) return;
  if (!data || !data.dataset || data.dataset.length === 0) {
    serverErrorEl.textContent = 'No servers available';
    serverErrorEl.style.display = 'block';
    return;
  }

  // Reset dropdown (keep the leading "Select server..." placeholder).
  while (serverSelectEl.options.length > 1) serverSelectEl.remove(1);

  const servers = data.dataset
    .map(s => ({ ...s, sortName: (s.name || '').replace(/[^\x00-\x7F]/g, '').trim() }))
    .filter(s => s.sortName)
    .sort((a, b) => a.sortName.localeCompare(b.sortName));

  servers.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.url;
    const city = s.city || '';
    opt.textContent = `${s.sortName}${city ? ' (' + city + ')' : ''}`;
    opt.dataset.desc = s.desc || '';
    opt.dataset.quality = s.audioQuality || '';
    serverSelectEl.appendChild(opt);
  });

  serverListPopulated = true;
  restoreLastServer();
}

electronAPI.onServerListData(handleServerListData);

// Fallback if the main-process push race-loses the renderer load.
setTimeout(() => {
  if (!serverListPopulated) {
    electronAPI.getServerList().then(handleServerListData).catch(err => {
      console.error('Server list fetch failed:', err);
    });
  }
}, 3000);

serverSelectEl.addEventListener('change', () => {
  const url = serverSelectEl.value;
  if (url) {
    localStorage.setItem('lastServer', url);
    urlInputEl.value = url;
    document.getElementById('url-btn').click();
  }
});

// Restore last selected server after options are loaded
function restoreLastServer() {
  const lastServer = localStorage.getItem('lastServer');
  if (!lastServer) return;
  
  if (serverSelectEl.options.length > 1) {
    for (let i = 0; i < serverSelectEl.options.length; i++) {
      if (serverSelectEl.options[i].value === lastServer) {
        serverSelectEl.selectedIndex = i;
        urlInputEl.value = lastServer;
        return;
      }
    }
    // Server not in dropdown, still set the URL
    urlInputEl.value = lastServer;
  }
}

function sendCmd(cmd) {
  electronAPI.wsSend(cmd);
}

function updateAntennaLabel() {
  const antBtn = document.getElementById('ant-btn');
  if (!antBtn) return;
  if (!currentData || currentData.ant === undefined || currentData.ant === null) {
    antBtn.textContent = 'Ant';
    return;
  }
  const idx = parseInt(currentData.ant, 10) || 0;
  const label = antNames[idx] !== undefined ? antNames[idx] : String(idx);
  antBtn.textContent = `Ant: ${label}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Mirrors fm-dx-webserver/web/js/main.js processString: graduated opacity
// per-character based on the parser's per-byte error count.
function processStringWithErrors(str, errors) {
  if (!str) return '';
  const errArr = (errors || '').split(',');
  const maxAlpha = 70;
  const alphaRange = 50;
  const maxError = 10;
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const ch = escapeHtml(str[i]);
    const errN = parseInt(errArr[i], 10);
    if (errN > 0) {
      const alpha = errN * (alphaRange / (maxError + 1));
      const opacity = Math.max(0, maxAlpha - alpha);
      out += `<span style="opacity:${opacity}%">${ch}</span>`;
    } else {
      out += ch;
    }
  }
  return out;
}

// The server's decode_unicode wraps non-printable bytes as literal "[0xNN]"
// substrings (RT end-marker 0x0D is the common one). Strip them for display.
function cleanRdsText(s) {
  if (!s) return '';
  return s.replace(/\[0x[0-9A-Fa-f]{2}\]/g, '').trim();
}

function setRtLine(id, label, text, isActive) {
  const el = document.getElementById(id);
  if (!el) return;
  const hasText = text && text.trim();
  el.classList.toggle('empty', !hasText);
  el.classList.toggle('active', !!isActive && !!hasText);
  el.innerHTML = `<span class="lcd-title-label">${label}</span><span class="lcd-rt-text">${hasText ? text : '—'}</span>`;
}

// PI may contain '?' nibbles where the parser is uncertain.
// Upstream dims the whole PI by 20% per '?'.
function renderPi(pi) {
  if (!pi) return '----';
  const qCount = (pi.match(/\?/g) || []).length;
  const opacity = Math.max(0, 1 - qCount * 0.2);
  return `<span style="opacity:${opacity}">${escapeHtml(pi.toUpperCase())}</span>`;
}

electronAPI.onInitArgs((a) => {
  if (a.version) {
    appVersion = a.version;
    const verEl = document.getElementById('version');
    if (verEl) verEl.textContent = `v${appVersion}`;
  }
  if (a.url !== undefined) {
    currentUrl = a.url;
    urlInputEl.value = currentUrl || '';
    if (currentUrl) {
      startPing();
      electronAPI.getTunerInfo(currentUrl).then(info => {
        if (info) {
          antNames = info.antNames || [];
          if (info.activeAnt !== undefined) {
            if (!currentData) currentData = {};
            currentData.ant = info.activeAnt;
          }
          updateAntennaLabel();
        }
      });
    }
  }
});

electronAPI.onWsError((data) => {
  console.error('WebSocket error:', data.message);
  setConnectionStatus('Disconnected');
  const statusEl = document.getElementById('audio-status');
  if (statusEl) {
    statusEl.textContent = 'Disconnected';
    statusEl.className = 'status-value stopped';
  }
});

electronAPI.onWsConnected(() => {
  isConnected = true;
  document.getElementById('url-btn').textContent = 'Disconnect';
  setConnectionStatus('Connected');
  if (currentUrl) {
    electronAPI.getTunerInfo(currentUrl).then(info => {
      if (info) {
        antNames = info.antNames || [];
        if (info.activeAnt !== undefined) {
          if (!currentData) currentData = {};
          currentData.ant = info.activeAnt;
        }
        updateAntennaLabel();
      }
    }).catch(() => {});
  }
  fetchSpectrumData();
  setTimeout(() => fetchSpectrumData(), 1500);
});

electronAPI.onWsData((data) => {
  try {
    currentData = JSON.parse(data);
    if (currentData && currentData.freq !== undefined) {
      setConnectionStatus('Connected');
    }
    updateUI();
  } catch (err) {
    console.error(err);
  }
});

electronAPI.onRdsAdvanced((data) => {
  rdsAdvanced = data;
  renderAdvancedRds();
  // Refresh the LCD bits that read from rdsAdvanced (RT-A/RT-B, PTYN, Long PS, BER).
  if (currentData) updateUI();
});

electronAPI.onDisconnected(() => {
  isConnected = false;
  document.getElementById('url-btn').textContent = 'Connect';
  setConnectionStatus('Disconnected');
  cleanup();
});

playBtn.addEventListener('click', async () => {
  if (audioPlaying) {
    stopAudioPlayback();
    setPlayBtn(false);
    updateStatus();
    return;
  }
  if (!currentUrl) return;
  setPlayBtn(true);
  updateStatus();
  await startAudioPlayback();
  if (!audioPlaying) {
    setPlayBtn(false);
  }
  updateStatus();
});

// Keybindings mirror the terminal-version (fm-dx-console.js) shortcut table.
// Suppressed while the user is typing in an input/select so they don't fight.
function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const typing = isTypingTarget(document.activeElement);

  // Escape works even inside inputs — blurs focus / closes overlays.
  if (e.key === 'Escape') {
    const overlay = document.getElementById('help-overlay');
    if (overlay) { overlay.remove(); return; }
    if (typing) document.activeElement.blur();
    return;
  }
  if (typing) return;

  switch (e.key) {
    case 'ArrowLeft':  e.preventDefault(); doTune(-100); break;
    case 'ArrowRight': e.preventDefault(); doTune(100); break;
    case 'ArrowUp':    e.preventDefault(); doTune(10); break;
    case 'ArrowDown':  e.preventDefault(); doTune(-10); break;
    case 'x':  doTune(1000); break;
    case 'z':  doTune(-1000); break;
    case 'r':
    case 'R':
      if (currentData && currentData.freq !== undefined) {
        sendCmd(`T${Math.round(parseFloat(currentData.freq) * 1000)}`);
        resetRdsUI();
      }
      break;
    case 'p': playBtn.click(); break;
    case '[': document.getElementById('ims-btn').click(); break;
    case ']': document.getElementById('eq-btn').click(); break;
    case 'y': document.getElementById('ant-btn').click(); break;
    case 't': e.preventDefault(); freqInputEl.focus(); freqInputEl.select(); break;
    case 'a':
    case 'A': {
      const card = document.querySelector('.card-advanced');
      if (card) card.style.display = card.style.display === 'none' ? '' : 'none';
      break;
    }
    case 'h':
    case 'H': toggleHelpOverlay(); break;
    case '?': toggleHelpOverlay(); break;
  }
});

function toggleHelpOverlay() {
  let overlay = document.getElementById('help-overlay');
  if (overlay) { overlay.remove(); return; }
  overlay = document.createElement('div');
  overlay.id = 'help-overlay';
  overlay.innerHTML = `
    <div class="help-card">
      <div class="help-title">Keyboard shortcuts</div>
      <div class="help-grid">
        <kbd>←</kbd><span>–0.1 MHz</span>
        <kbd>→</kbd><span>+0.1 MHz</span>
        <kbd>↑</kbd><span>+0.01 MHz</span>
        <kbd>↓</kbd><span>–0.01 MHz</span>
        <kbd>z</kbd><span>–1 MHz</span>
        <kbd>x</kbd><span>+1 MHz</span>
        <kbd>t</kbd><span>Focus frequency</span>
        <kbd>r</kbd><span>Re-tune current freq (reset RDS)</span>
        <kbd>p</kbd><span>Play / stop audio</span>
        <kbd>[</kbd><span>Toggle iMS</span>
        <kbd>]</kbd><span>Toggle EQ</span>
        <kbd>y</kbd><span>Cycle antenna</span>
        <kbd>a</kbd><span>Toggle Advanced RDS panel</span>
        <kbd>h</kbd><span>Toggle this help</span>
        <kbd>Esc</kbd><span>Close / unfocus</span>
      </div>
      <div class="help-hint">Click anywhere to close</div>
    </div>`;
  overlay.addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
}

function updateUI() {
  if (!currentData) return;
  updateAntennaLabel();

  // Filter buttons reflect server-confirmed state (not the local optimistic toggle)
  const imsBtn = document.getElementById('ims-btn');
  const eqBtn = document.getElementById('eq-btn');
  if (imsBtn) imsBtn.classList.toggle('active', !!currentData.ims);
  if (eqBtn)  eqBtn.classList.toggle('active', !!currentData.eq);

  // Frequency
  if (currentData.freq !== undefined && currentData.freq !== null) {
    const freq = parseFloat(currentData.freq);
    if (!isNaN(freq) && document.activeElement !== freqInputEl && !dragging) {
      freqInputEl.value = freq.toFixed(3);
      if (spectrumData && Object.keys(spectrumData).length > 0) {
        drawSpectrum(spectrumData);
      }
    }
  }

  // Signal
  if (currentData.sig !== undefined) {
    const sig = parseFloat(currentData.sig);
    if (!isNaN(sig)) {
      const fill = document.getElementById('signal-fill');
      const value = document.getElementById('signal-value');
      const percent = Math.min(100, Math.max(0, ((sig + 30) / 130) * 100));
      fill.style.width = percent + '%';
      
      let disp = sig;
      let unit = 'dBf';
      switch (unitSelectEl.value) {
        case 'dbuv': disp = sig - 11.25; unit = 'dBµV'; break;
        case 'dbm': disp = sig - 120; unit = 'dBm'; break;
      }
      value.textContent = `${disp.toFixed(1)} ${unit}`;

      // Mirror into the LCD header numeric readout
      const lcdSigVal = document.getElementById('lcd-sig-val');
      const lcdSigUnit = document.getElementById('lcd-sig-unit');
      if (lcdSigVal) {
        lcdSigVal.textContent = disp.toFixed(1);
        lcdSigVal.classList.remove('empty');
      }
      if (lcdSigUnit) lcdSigUnit.textContent = unit;

      signalHistory.push(sig);
      if (signalHistory.length > SIGNAL_HISTORY_MAX) {
        signalHistory = signalHistory.slice(-SIGNAL_HISTORY_MAX);
      }
      drawSignalLiveGraph();
    }
  }

  // Station block — broadcast-only.
  //   Big slot: Long PS when available, otherwise PS.
  //   Sub line: PS (only when the big slot is showing Long PS, so the user
  //   still sees the rotating short PS underneath).
  // The transmitter-database name (txInfo.tx) is NOT shown here; that lives
  // on the Transmitter card.
  const psClean = cleanRdsText(currentData.ps);
  const psHtml = psClean
    ? processStringWithErrors(psClean, currentData.ps_errors)
    : '';
  const longPs = cleanRdsText(rdsAdvanced && rdsAdvanced.longPs);
  const useLongPs = !!longPs && longPs !== psClean;

  const bigEl = document.getElementById('lcd-station-big');
  const subEl = document.getElementById('lcd-station-sub');
  if (bigEl) {
    if (useLongPs) {
      bigEl.textContent = longPs;
      bigEl.classList.remove('empty');
    } else if (psClean) {
      bigEl.innerHTML = psHtml;
      bigEl.classList.remove('empty');
    } else {
      bigEl.textContent = '---';
      bigEl.classList.add('empty');
    }
  }
  if (subEl) {
    subEl.innerHTML = (useLongPs && psClean) ? `<b>PS</b> ${psHtml}` : '';
  }

  // Long PS indicator LED — lit whenever the station emits a long PS.
  const lpsBadge = document.getElementById('lps-badge');
  if (lpsBadge) lpsBadge.classList.toggle('inactive', !longPs);

  // Legacy hidden element — keep ps-led textContent in sync for any external readers
  const psLedEl = document.getElementById('ps-led');
  if (psLedEl) psLedEl.textContent = currentData.ps || '---';
  const legacyPsEl = document.getElementById('rds-ps');
  if (legacyPsEl) legacyPsEl.textContent = currentData.ps || '';

  // RDS flags — always visible, dimmed when not active (matches upstream).
  //   tp/ta: 0/1 or true/false   ms: -1 unknown, 0 Speech, 1 Music   st: bool
  const flagsEl = document.getElementById('rds-flags');
  if (flagsEl) {
    const flag = (label, active) =>
      `<span class="lcd-flag${active ? ' active' : ''}">${label}</span>`;
    const ms = Number(currentData.ms);
    const msInner = ms === 1
      ? '<b>M</b><span style="opacity:0.5">S</span>'
      : ms === 0
        ? '<span style="opacity:0.5">M</span><b>S</b>'
        : '<span style="opacity:0.5">MS</span>';
    flagsEl.innerHTML = [
      flag('TP', !!currentData.tp),
      flag('TA', !!currentData.ta),
      `<span class="lcd-flag${ms === 1 || ms === 0 ? ' active' : ''}">${msInner}</span>`,
      flag('ST', !!currentData.st)
    ].join('');
  }

  // PI / PTY / AF / ECC / Country
  const pi = (typeof currentData.pi === 'string') ? currentData.pi : '';
  const ptyNum = (typeof currentData.pty === 'number') ? currentData.pty : 0;
  const ptyName = EUROPE_PTY[ptyNum] || `PTY ${ptyNum}`;

  const ptyHeroEl = document.getElementById('hero-pty');
  if (ptyHeroEl) ptyHeroEl.textContent = ptyName;

  const piEl = document.getElementById('pi-display');
  if (piEl) piEl.innerHTML = renderPi(pi);

  const rdsInfoEl = document.getElementById('rds-info');
  if (rdsInfoEl) {
    const lines = [];
    lines.push(`PTY: ${ptyName}`);
    if (currentData.ecc) lines.push(`ECC: ${currentData.ecc}`);
    if (currentData.country_iso && currentData.country_iso !== 'UN') {
      lines.push(`Country: ${currentData.country_name || currentData.country_iso} (${currentData.country_iso})`);
    }
    if (currentData.rt_flag) lines.push(`RT flag: ${currentData.rt_flag}`);
    if (Array.isArray(currentData.af) && currentData.af.length) {
      const sorted = currentData.af.slice().sort((a, b) => a - b);
      const mhz = sorted.map(v => (v / 1000).toFixed(1));
      lines.push(`AF (${mhz.length}): ${mhz.join(', ')}`);
    }
    rdsInfoEl.textContent = lines.join('\n');
  }

  const badgeEl = document.getElementById('rds-badge');
  if (badgeEl) {
    const hasRds = currentData.rds === true;
    badgeEl.textContent = hasRds ? 'RDS LOCK' : 'NO RDS';
    badgeEl.classList.toggle('inactive', !hasRds);
  }

  // RT-A / RT-B — use the decoder's per-message buffers when available.
  // The /text rt0+rt1 path only carries one current RT (whichever flag is
  // active), so it's a fallback for the active slot only — never duplicate
  // it into the inactive slot.
  const rtA_raw = cleanRdsText(rdsAdvanced && rdsAdvanced.rtA);
  const rtB_raw = cleanRdsText(rdsAdvanced && rdsAdvanced.rtB);
  const rtFlag = (rdsAdvanced && rdsAdvanced.rtAbFlag) || 'A';
  const fallback = [
    cleanRdsText(currentData.rt0),
    cleanRdsText(currentData.rt1)
  ].filter(Boolean).join(' ').trim();
  const rtA_show = rtA_raw || (rtFlag === 'A' ? fallback : '');
  const rtB_show = rtB_raw || (rtFlag === 'B' ? fallback : '');
  setRtLine('lcd-rt-a', 'RT-A', rtA_show, rtFlag === 'A');
  setRtLine('lcd-rt-b', 'RT-B', rtB_show, rtFlag === 'B');

  // Long PS — small secondary line right under the big PS readout.
  const longPsEl = document.getElementById('lcd-longps');
  if (longPsEl) {
    const longPs = cleanRdsText(rdsAdvanced && rdsAdvanced.longPs);
    const ps = cleanRdsText(currentData.ps);
    const showLong = longPs && longPs !== ps;
    longPsEl.textContent = showLong ? longPs : '';
    longPsEl.hidden = !showLong;
  }

  // PTYN (programme-type name) — centered, dim, in the header strip.
  const ptynEl = document.getElementById('lcd-ptyn');
  if (ptynEl) {
    const ptyn = cleanRdsText(rdsAdvanced && rdsAdvanced.ptyn);
    ptynEl.textContent = ptyn || '';
  }

  // Country chip
  const countryEl = document.getElementById('lcd-country');
  if (countryEl) {
    const iso = currentData.country_iso;
    const hasCountry = iso && iso !== 'UN';
    countryEl.textContent = hasCountry ? iso : '';
    countryEl.hidden = !hasCountry;
    if (hasCountry && currentData.country_name) countryEl.title = currentData.country_name;
  }

  // AF count
  const afEl = document.getElementById('lcd-af');
  if (afEl) {
    const af = Array.isArray(currentData.af) ? currentData.af.length : 0;
    afEl.textContent = af ? String(af) : '0';
    afEl.classList.toggle('dim', af === 0);
  }

  // BER from advanced RDS
  const berEl = document.getElementById('lcd-ber');
  if (berEl) {
    const ber = rdsAdvanced && typeof rdsAdvanced.ber === 'number' ? rdsAdvanced.ber : null;
    berEl.textContent = ber == null ? '—' : ber.toFixed(2);
    berEl.classList.toggle('dim', ber == null);
  }

  // Signal bar inside the LCD top strip — last lit bar gets a "peak" tint
  const sigBar = document.getElementById('lcd-sig-bar');
  if (sigBar) {
    const sig = parseFloat(currentData.sig);
    const bars = sigBar.children;
    const lit = isNaN(sig) ? 0 : Math.max(0, Math.min(bars.length, Math.round((sig + 20) / 10)));
    for (let i = 0; i < bars.length; i++) {
      const isOn = i < lit;
      bars[i].classList.toggle('on', isOn);
      bars[i].classList.toggle('peak', isOn && i === lit - 1);
    }
  }

  // Station / TX info — fields per fm-dx-webserver/server/datahandler.js.
  const stationEl = document.getElementById('station-info');
  const tx = currentData.txInfo;
  const hasTx = tx && tx.tx && tx.tx.length > 1;
  if (!hasTx) {
    stationEl.textContent = 'No transmitter match';
  } else {
    const imperial = localStorage.getItem('imperialUnits') === 'true';
    const distKm = parseFloat(tx.dist);
    const distStr = isNaN(distKm)
      ? '-'
      : imperial
        ? `${(distKm * 0.621371).toFixed(0)} mi`
        : `${distKm.toFixed(0)} km`;
    const others = Array.isArray(tx.otherMatches) ? tx.otherMatches.length : 0;
    const nameLine = tx.tx + (others > 0 ? `  (+${others})` : '');
    const locLine = [tx.city, tx.itu].filter(Boolean).join(', ');
    const lines = [
      `Name:     ${nameLine}`,
      `Location: ${locLine || '-'}`,
      `Distance: ${distStr}`,
      `Power:    ${tx.erp || '-'} kW${tx.pol ? `  [${String(tx.pol).toUpperCase()}]` : ''}`,
      `Azimuth:  ${tx.azi != null ? tx.azi + '°' : '-'}`
    ];
    if (tx.reg === true && tx.pi) lines.push(`Reg PI:   ${tx.pi.toUpperCase()}`);
    if (typeof tx.score === 'number') lines.push(`Score:    ${tx.score}`);
    stationEl.textContent = lines.join('\n');
  }

  renderAdvancedRds();
  updateStatus();
}

function updateStatus() {
  const usersEl = document.getElementById('users');
  const pingEl = document.getElementById('ping');
  const audioEl = document.getElementById('audio-status');
  
  usersEl.textContent = (currentData && currentData.users !== undefined) ? currentData.users : '-';
  pingEl.textContent = lastPing !== null ? lastPing + ' ms' : '-';
  
  if (audioPlaying) {
    audioEl.textContent = 'Playing';
    audioEl.className = 'status-value playing';
  } else {
    audioEl.textContent = 'Stopped';
    audioEl.className = 'status-value stopped';
  }
}

function setConnectionStatus(status) {
  const connEl = document.getElementById('connection-status');
  if (!connEl) return;
  connEl.textContent = status;
  if (status === 'Connected') {
    connEl.className = 'status-value online';
  } else if (status === 'Connecting...') {
    connEl.className = 'status-value stopped';
  } else {
    connEl.className = 'status-value stopped';
  }
}

function resetRdsUI() {
  const bigEl = document.getElementById('lcd-station-big');
  if (bigEl) { bigEl.textContent = '---'; bigEl.classList.add('empty'); }
  const subEl = document.getElementById('lcd-station-sub');
  if (subEl) subEl.innerHTML = '';
  const lpsBadge = document.getElementById('lps-badge');
  if (lpsBadge) lpsBadge.classList.add('inactive');
  document.getElementById('rds-flags').innerHTML = '';
  document.getElementById('rds-info').textContent = '';
  setRtLine('lcd-rt-a', 'RT-A', '', false);
  setRtLine('lcd-rt-b', 'RT-B', '', false);
  const longPsEl = document.getElementById('lcd-longps');
  if (longPsEl) { longPsEl.textContent = ''; longPsEl.hidden = true; }
  const ptynEl = document.getElementById('lcd-ptyn');
  if (ptynEl) ptynEl.textContent = '';
  const countryEl = document.getElementById('lcd-country');
  if (countryEl) { countryEl.textContent = ''; countryEl.hidden = true; }
  const afEl = document.getElementById('lcd-af');
  if (afEl) { afEl.textContent = '0'; afEl.classList.add('dim'); }
  const berEl = document.getElementById('lcd-ber');
  if (berEl) { berEl.textContent = '—'; berEl.classList.add('dim'); }
  const piEl = document.getElementById('pi-display');
  if (piEl) piEl.textContent = '----';
  const psLedEl = document.getElementById('ps-led');
  if (psLedEl) psLedEl.textContent = '---';
  const badgeEl = document.getElementById('rds-badge');
  if (badgeEl) {
    badgeEl.textContent = 'NO RDS';
    badgeEl.classList.add('inactive');
  }
  const sigBar = document.getElementById('lcd-sig-bar');
  if (sigBar) for (const b of sigBar.children) b.classList.remove('on', 'peak');
  const lcdSigVal = document.getElementById('lcd-sig-val');
  if (lcdSigVal) { lcdSigVal.textContent = '--.-'; lcdSigVal.classList.add('empty'); }
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

// fm-dx-webserver expects a combined G<eq><ims> command, e.g. G10 or G01.
// Local toggling is purely optimistic; updateUI() re-syncs from currentData
// on the next /text push so the button can't drift from server state.
function sendFilterCmd() {
  const eq = currentData && currentData.eq ? 1 : 0;
  const ims = currentData && currentData.ims ? 1 : 0;
  sendCmd(`G${eq}${ims}`);
}

document.getElementById('ims-btn').onclick = () => {
  if (!currentData) currentData = {};
  currentData.ims = currentData.ims ? 0 : 1;
  sendFilterCmd();
};

document.getElementById('eq-btn').onclick = () => {
  if (!currentData) currentData = {};
  currentData.eq = currentData.eq ? 0 : 1;
  sendFilterCmd();
};

document.getElementById('ant-btn').onclick = (e) => {
  if (!currentData) return;
  const currentAnt = parseInt(currentData.ant, 10) || 0;
  const antCount = Math.max(antNames.length, 1);
  const nextAnt = (currentAnt + 1) % antCount;
  sendCmd(`Z${nextAnt}`);
  currentData.ant = nextAnt;
  if (spectrumReloadTimer) {
    clearTimeout(spectrumReloadTimer);
    spectrumReloadTimer = null;
  }
  fetchSpectrumData();
  setTimeout(() => fetchSpectrumData(), 450);
  setTimeout(() => fetchSpectrumData(), 1200);
  spectrumReloadTimer = setTimeout(() => {
    fetchSpectrumData();
    spectrumReloadTimer = null;
  }, 2200);
};

document.getElementById('spectrum-btn').onclick = () => {
  fetchSpectrumData();
};

urlInputEl.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    document.getElementById('url-btn').click();
  }
});

freqInputEl.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    const freq = parseFloat(freqInputEl.value);
    if (!isNaN(freq) && freq >= 76 && freq <= 108) {
      sendCmd(`T${Math.round(freq * 1000)}`);
    }
  }
});

freqInputEl.addEventListener('blur', () => {
  const freq = parseFloat(freqInputEl.value);
  if (isNaN(freq) || freq < 76 || freq > 108) return;
  // Don't re-tune when the user just tabbed out — only if the displayed
  // value actually differs from the server's current frequency.
  const serverFreq = currentData && parseFloat(currentData.freq);
  if (!isNaN(serverFreq) && Math.abs(freq - serverFreq) < 0.005) return;
  sendCmd(`T${Math.round(freq * 1000)}`);
});

freqInputEl.addEventListener('mousedown', () => { dragging = true; });
freqInputEl.addEventListener('mouseup', () => { dragging = false; });

freqInputEl.addEventListener('input', () => {
  if (spectrumData && Object.keys(spectrumData).length > 0) {
    drawSpectrum(spectrumData);
  }
});

function tuneByWheel(e) {
  e.preventDefault();
  const now = Date.now();
  if (now - freqWheelLastTuneTime < 40) return;
  freqWheelLastTuneTime = now;

  // Default wheel step is 0.1 MHz; Shift=1 MHz, Alt=0.01 MHz.
  const stepKhz = e.shiftKey ? 1000 : (e.altKey ? 10 : 100);
  const direction = e.deltaY < 0 ? 1 : -1;
  const deltaKhz = direction * stepKhz;

  let baseFreqMhz = NaN;
  if (currentData && currentData.freq !== undefined) {
    baseFreqMhz = parseFloat(currentData.freq);
  }
  if (isNaN(baseFreqMhz)) {
    baseFreqMhz = parseFloat(freqInputEl.value);
  }
  if (isNaN(baseFreqMhz)) return;

  let nextKhz = Math.round(baseFreqMhz * 1000) + deltaKhz;
  nextKhz = Math.max(76000, Math.min(108000, nextKhz));
  freqInputEl.value = (nextKhz / 1000).toFixed(3);
  sendCmd(`T${nextKhz}`);
  resetRdsUI();
}

freqInputEl.addEventListener('wheel', tuneByWheel, { passive: false });
const freqDisplayEl = document.querySelector('.freq-display');
if (freqDisplayEl) {
  freqDisplayEl.addEventListener('wheel', tuneByWheel, { passive: false });
}

function startPing() {
  if (pingTimer) clearInterval(pingTimer);
  pingTimer = setInterval(async () => {
    if (!currentUrl) return;
    try {
      const u = new URL(currentUrl);
      const start = Date.now();
      await fetch(u.origin + '/ping', { mode: 'no-cors' });
      lastPing = Date.now() - start;
      updateStatus();
    } catch {}
  }, 5000);
}

// Spectrum
function cleanup() {
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
  audioPlaying = false;
  stopAudioPlayback();
  currentData = null;
  rdsAdvanced = null;
  antNames = [];
  spectrumData = {};
  spectrumRange = null;
  signalHistory = [];
  drawSignalLiveGraph();
  updateAntennaLabel();
}

async function fetchSpectrumData() {
  if (!currentUrl) return;
  try {
    const u = new URL(currentUrl);
    u.pathname = u.pathname.replace(/\/$/, '') + '/spectrum-graph-plugin';
    u.searchParams.set('_ts', String(Date.now()));
    const res = await fetch(u.toString(), {
      headers: {
        'X-Plugin-Name': 'SpectrumGraphPlugin',
        'Cache-Control': 'no-cache, no-store, max-age=0',
        Pragma: 'no-cache'
      },
      cache: 'no-store'
    });
    if (!res.ok) return;
    const data = await res.json();
    const raw = data.sdFm || data.sd || '';
    if (!raw) return;
    spectrumData = parseSpectrumData(raw);
    drawSpectrum(spectrumData);
  } catch (e) {
    console.error('Spectrum fetch error:', e);
  }
}

function parseSpectrumData(str) {
  if (!str) return [];
  const data = {};
  const pairs = str.split(',');
  for (const pair of pairs) {
    const [freqKHz, val] = pair.split('=');
    if (freqKHz && val) {
      const freqMHz = parseInt(freqKHz) / 1000;
      data[freqMHz] = parseFloat(val);
    }
  }
  return data;
}

function chartTheme() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n, fallback) => (cs.getPropertyValue(n).trim() || fallback);
  return {
    bg:     v('--chart-bg', '#fafafa'),
    grid:   v('--chart-grid', 'rgba(0,0,0,0.08)'),
    line:   v('--chart-line', '#2563eb'),
    text:   v('--chart-text', '#71717a'),
    marker: v('--chart-marker', '#dc2626'),
    font:   v('--font-ui', 'system-ui, sans-serif')
  };
}

function drawSpectrum(points) {
  const svg = document.getElementById('spectrum-svg');
  if (!svg) return;
  const t = chartTheme();

  const width = svg.clientWidth || 800;
  const height = svg.clientHeight || 160;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  if (!points || Object.keys(points).length === 0) {
    spectrumRange = null;
    svg.innerHTML = `<rect x="0" y="0" width="${width}" height="${height}" fill="${t.bg}"/><text x="${width/2}" y="${height/2}" fill="${t.text}" text-anchor="middle" font-family="${t.font}" font-size="12">No spectrum data</text>`;
    return;
  }

  const freqs = Object.keys(points).map(parseFloat).filter(f => !isNaN(f)).sort((a, b) => a - b);
  if (freqs.length === 0) {
    spectrumRange = null;
    svg.innerHTML = `<rect x="0" y="0" width="${width}" height="${height}" fill="${t.bg}"/><text x="${width/2}" y="${height/2}" fill="${t.text}" text-anchor="middle" font-family="${t.font}" font-size="12">No spectrum data</text>`;
    return;
  }
  const minFreq = freqs[0];
  const maxFreq = freqs[freqs.length - 1];
  const freqRange = Math.max(maxFreq - minFreq, 0.0001);

  const vals = Object.values(points);
  const minDb = Math.min(...vals);
  const maxDb = Math.max(...vals);
  const dbRange = maxDb - minDb || 1;

  const marginLeft = 35;
  const marginRight = 10;
  const marginTop = 10;
  const marginBottom = 28;
  const graphWidth = width - marginLeft - marginRight;
  const graphHeight = height - marginTop - marginBottom;
  spectrumRange = { minFreq, maxFreq, marginLeft, marginRight, graphWidth };

  const freqX = (f) => marginLeft + ((f - minFreq) / freqRange) * graphWidth;
  const dbY = (db) => marginTop + graphHeight - ((db - minDb) / dbRange) * graphHeight;

  let svgContent = '';
  svgContent += `<rect x="0" y="0" width="${width}" height="${height}" fill="${t.bg}"/>`;

  for (let db = Math.floor(minDb / 20) * 20; db <= maxDb; db += 20) {
    const y = dbY(db);
    svgContent += `<line x1="${marginLeft}" y1="${y}" x2="${width-marginRight}" y2="${y}" stroke="${t.grid}" stroke-width="1"/>`;
    svgContent += `<text x="${marginLeft-5}" y="${y+3}" fill="${t.text}" font-family="${t.font}" font-size="10" text-anchor="end">${db}</text>`;
  }

  const freqTickStep = freqRange <= 2 ? 0.2 : freqRange <= 5 ? 0.5 : freqRange <= 12 ? 1 : 2;
  const firstFreqTick = Math.ceil(minFreq / freqTickStep) * freqTickStep;
  for (let f = firstFreqTick; f <= maxFreq + 1e-6; f += freqTickStep) {
    const x = freqX(f);
    svgContent += `<line x1="${x}" y1="${marginTop}" x2="${x}" y2="${height-marginBottom}" stroke="${t.grid}" stroke-width="1"/>`;
    svgContent += `<text x="${x}" y="${height-8}" fill="${t.text}" font-family="${t.font}" font-size="10" text-anchor="middle">${f.toFixed(freqTickStep < 1 ? 1 : 0)}</text>`;
  }

  const currentFreq = parseFloat(document.getElementById('freq-input').value);
  if (currentFreq && currentFreq >= minFreq && currentFreq <= maxFreq) {
    const mx = freqX(currentFreq);
    svgContent += `<line x1="${mx}" y1="${marginTop}" x2="${mx}" y2="${height-marginBottom}" stroke="${t.marker}" stroke-width="1.5"/>`;
  }

  let pathD = '';
  for (let i = 0; i < freqs.length; i++) {
    const f = freqs[i];
    const x = freqX(f);
    const y = dbY(points[f]);
    pathD += (i === 0 ? 'M' : 'L') + ` ${x} ${y} `;
  }

  svgContent += `<path d="${pathD}" fill="none" stroke="${t.line}" stroke-width="1.5"/>`;
  svgContent += `<text x="5" y="${height-8}" fill="${t.text}" font-family="${t.font}" font-size="9">MHz</text>`;

  svg.innerHTML = svgContent;
}

function drawSignalLiveGraph() {
  const svg = document.getElementById('signal-live-svg');
  if (!svg) return;
  const t = chartTheme();

  const width = svg.clientWidth || 800;
  const height = svg.clientHeight || 166;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  const marginLeft = 35;
  const marginRight = 10;
  const marginTop = 10;
  const marginBottom = 24;
  const graphWidth = width - marginLeft - marginRight;
  const graphHeight = height - marginTop - marginBottom;

  let content = `<rect x="0" y="0" width="${width}" height="${height}" fill="${t.bg}"/>`;

  if (!signalHistory.length) {
    content += `<text x="${width / 2}" y="${height / 2}" fill="${t.text}" text-anchor="middle" font-family="${t.font}" font-size="12">No live signal data</text>`;
    svg.innerHTML = content;
    return;
  }

  const minSigRaw = Math.min(...signalHistory);
  const maxSigRaw = Math.max(...signalHistory);
  const pad = Math.max(2, (maxSigRaw - minSigRaw) * 0.15);
  const minSig = minSigRaw - pad;
  const maxSig = maxSigRaw + pad;
  const sigRange = Math.max(1, maxSig - minSig);
  const sigY = (v) => marginTop + graphHeight - ((v - minSig) / sigRange) * graphHeight;

  const yTicks = 4;
  for (let i = 0; i <= yTicks; i++) {
    const v = minSig + (i / yTicks) * sigRange;
    const y = sigY(v);
    content += `<line x1="${marginLeft}" y1="${y}" x2="${width - marginRight}" y2="${y}" stroke="${t.grid}" stroke-width="1"/>`;
    content += `<text x="${marginLeft - 5}" y="${y + 3}" fill="${t.text}" font-family="${t.font}" font-size="10" text-anchor="end">${v.toFixed(1)}</text>`;
  }

  const xStep = signalHistory.length > 1 ? graphWidth / (signalHistory.length - 1) : 0;
  let pathD = '';
  for (let i = 0; i < signalHistory.length; i++) {
    const x = marginLeft + i * xStep;
    const y = sigY(signalHistory[i]);
    pathD += `${i === 0 ? 'M' : 'L'} ${x} ${y} `;
  }

  content += `<path d="${pathD}" fill="none" stroke="${t.line}" stroke-width="1.5"/>`;
  content += `<text x="5" y="${height - 8}" fill="${t.text}" font-family="${t.font}" font-size="9">Live</text>`;
  content += `<text x="${width - 6}" y="${height - 8}" fill="${t.text}" font-family="${t.font}" font-size="9" text-anchor="end">Signal (dBf)</text>`;
  svg.innerHTML = content;
}

function freqFromX(svg, clientX) {
  if (!spectrumRange) {
    const freqs = Object.keys(spectrumData || {}).map(parseFloat).filter(f => !isNaN(f)).sort((a, b) => a - b);
    if (freqs.length >= 2) {
      spectrumRange = {
        minFreq: freqs[0],
        maxFreq: freqs[freqs.length - 1],
        marginLeft: 35,
        marginRight: 10
      };
    } else {
      return null;
    }
  }
  const rect = svg.getBoundingClientRect();
  const { minFreq, maxFreq, marginLeft, marginRight } = spectrumRange;
  const graphWidth = Math.max(1, rect.width - marginLeft - marginRight);
  const x = Math.max(0, Math.min(graphWidth, clientX - rect.left - marginLeft));
  return minFreq + (x / graphWidth) * (maxFreq - minFreq);
}

function tuneFromSpectrumPosition(svg, clientX, force = false) {
  const freqRaw = freqFromX(svg, clientX);
  if (freqRaw === null) return;
  const now = Date.now();
  if (!force && now - spectrumLastTuneTime < 100) return;
  spectrumLastTuneTime = now;
  const freq = Math.round(freqRaw * 10) / 10;
  freqInputEl.value = freq.toFixed(1);
  sendCmd(`T${Math.round(freq * 1000)}`);
}

const spectrumSvgEl = document.getElementById('spectrum-svg');
function tuneByWheelOnSpectrum(e) {
  e.preventDefault();
  const now = Date.now();
  if (now - freqWheelLastTuneTime < 40) return;
  freqWheelLastTuneTime = now;

  const stepKhz = e.shiftKey ? 1000 : (e.altKey ? 10 : 100);
  const direction = e.deltaY < 0 ? 1 : -1;
  const deltaKhz = direction * stepKhz;

  let baseFreqMhz = NaN;
  if (currentData && currentData.freq !== undefined) {
    baseFreqMhz = parseFloat(currentData.freq);
  }
  if (isNaN(baseFreqMhz)) {
    baseFreqMhz = parseFloat(freqInputEl.value);
  }
  if (isNaN(baseFreqMhz)) return;

  let nextKhz = Math.round(baseFreqMhz * 1000) + deltaKhz;
  nextKhz = Math.max(76000, Math.min(108000, nextKhz));
  freqInputEl.value = (nextKhz / 1000).toFixed(3);
  sendCmd(`T${nextKhz}`);
  resetRdsUI();
}

spectrumSvgEl.addEventListener('wheel', tuneByWheelOnSpectrum, { passive: false });
spectrumSvgEl.addEventListener('pointerdown', (e) => {
  if (!spectrumRange) return;
  e.preventDefault();
  spectrumDragActive = true;
  spectrumSvgEl.setPointerCapture(e.pointerId);
  tuneFromSpectrumPosition(spectrumSvgEl, e.clientX, true);
});

spectrumSvgEl.addEventListener('pointermove', (e) => {
  if (!spectrumDragActive) return;
  e.preventDefault();
  tuneFromSpectrumPosition(spectrumSvgEl, e.clientX, false);
});

spectrumSvgEl.addEventListener('pointerup', (e) => {
  if (!spectrumDragActive) return;
  spectrumDragActive = false;
  tuneFromSpectrumPosition(spectrumSvgEl, e.clientX, true);
  try { spectrumSvgEl.releasePointerCapture(e.pointerId); } catch (_) {}
});

spectrumSvgEl.addEventListener('pointercancel', () => {
  spectrumDragActive = false;
});

spectrumSvgEl.addEventListener('lostpointercapture', () => {
  spectrumDragActive = false;
});

// Plain click still tunes (in case the user clicks without dragging).
spectrumSvgEl.addEventListener('click', (e) => {
  tuneFromSpectrumPosition(spectrumSvgEl, e.clientX, true);
});

drawSignalLiveGraph();

function renderAdvancedRds() {
  const el = document.getElementById('rds-adv');
  if (!el || !rdsAdvanced) return;
  const d = rdsAdvanced;
  const stable = d.stableFlags || {};
  const lines = [];
  lines.push(`PI: ${d.state.currentPi || ''}   PTY: ${d.ptyName || ''} [${d.state.pty || ''}]`);
  lines.push(`TP/TA: ${stable.tpStable ? (d.state.tp ? '1' : '0') : '-'} / ${stable.taStable ? (d.state.ta ? '1' : '0') : '-'}   MS: ${stable.msStable ? (d.state.ms ? 'Music' : 'Speech') : '-'}`);
  lines.push(`DI: Stereo=${stable.diStereoStable ? (d.state.diStereo ? 1 : 0) : '-'} AH=${stable.diAhStable ? (d.state.diArtificialHead ? 1 : 0) : '-'} Comp=${stable.diCompStable ? (d.state.diCompressed ? 1 : 0) : '-'} DPTY=${stable.diDptyStable ? (d.state.diDynamicPty ? 1 : 0) : '-'}`);
  lines.push('');
  const psMark = d.psStable ? '*' : '';
  lines.push(`PS${psMark}: ${d.ps || ''}`);
  if (d.longPs) lines.push(`Long PS: ${d.longPs}`);
  if (d.ptyn) lines.push(`PTYN: ${d.ptyn}`);
  if (d.rtA) lines.push(`RT-A: ${d.rtA}`);
  if (d.rtB) lines.push(`RT-B: ${d.rtB}`);
  if (!d.rtA && !d.rtB && d.rt) {
    const rtMark = d.rtStable ? '*' : '';
    lines.push(`RT (${d.rtAbFlag ? 'B' : 'A'})${rtMark}: ${d.rt}`);
  }
  lines.push('');
  if (d.afList && d.afList.length) lines.push(`AF (${d.state.afType || 'A'}): ${d.afList.join(', ')}`);
  if (d.state.ecc || d.state.lic) lines.push(`ECC/LIC: ${(d.state.ecc || '-') + ' / ' + (d.state.lic || '-')}`);
  if (d.state.pin) lines.push(`PIN: ${d.state.pin}`);
  if (d.state.localTime || d.state.utcTime) lines.push(`Time: ${d.state.localTime || '-'}  UTC: ${d.state.utcTime || '-'}`);
  if (d.ber >= 0) lines.push(`BER: ${d.ber.toFixed(2)}%`);

  if (d.groupStats && d.groupStats.length) {
    const rows = [];
    for (let i = 0; i < Math.min(d.groupStats.length, 15); i += 3) {
      rows.push(d.groupStats.slice(i, i + 3).map(s => `${s.group}:${s.percent}%`).join('   '));
    }
    lines.push('');
    lines.push('Groups: ' + rows.shift());
    rows.forEach(r => lines.push('        ' + r));
  }

  if (d.eonData && Object.keys(d.eonData).length) {
    lines.push('');
    lines.push('EON:');
    for (const [pi, net] of Object.entries(d.eonData)) {
      let e = `${pi}: ${net.ps || '-'} TP=${net.tp?1:0} TA=${net.ta?1:0}`;
      if (net.af && net.af.length) e += ` AF=[${net.af.join(',')}]`;
      if (net.mappedFreqs && net.mappedFreqs.length) e += ` Map=[${net.mappedFreqs.join(',')}]`;
      if (net.linkageInfo) e += ` Link=${net.linkageInfo}`;
      if (net.pin) e += ` PIN=${net.pin}`;
      lines.push(e);
    }
  }

  el.textContent = lines.join('\n');
}
