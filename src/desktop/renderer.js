import { createAudioPlayer } from '../audio/browser-player.js';
import { stationRows } from '../lib/station.js';
import { parseSpectrumData } from '../lib/spectrum.js';
import { SHORTCUTS, shortcutFor } from '../lib/shortcuts.js';
import { parseFrequency } from '../lib/frequency.js';
import { normalizeUrl } from '../lib/urls.js';
import { bandwidthProfile, AGC_OPTIONS, tunerProfileKey } from '../lib/profiles.js';
import { filterRecentServers, filterServers } from '../lib/server-catalog.js';
import { cleanRdsText, convertSignal, unitLabel, nextSignalUnit, formatFrequency, flagEnabled, clampVolume } from '../lib/display.js';
import { broadcastModel, advancedRdsModel, summariseAf, timeOnly, diLine, stableLine, formatGroups, rtPlusLine } from '../lib/rds-display.js';

const electronAPI = window.electronAPI;

let currentData;
let audioPlaying = false;
let antNames = [];
let lastPing = null;
let currentUrl = '';
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

let connecting = false;
let autoPlayOnConnect = false;
let tunerInfo = { antNames: ['Default'], tunerType: '' };
let recentServers = [];
let publicServers = [];
let serverSource = 'recent';
let volume = 100;
let audioEpoch = 0;
let pendingFrequency = null;

// Audio player: WebSocket /audio (upstream's fallback-MP3 protocol) →
// MediaSource Extensions. Chromium decodes MP3 frames natively; we keep
// playback near the live edge by gently varying playbackRate. No hard seeks
// (they cause audible pops). Buffer pruning runs between appends.
let audioPlayer = null;
async function startAudioPlayback() {
  const epoch = ++audioEpoch;
  const url = await electronAPI.getAudioStreamUrl();
  if (!url || epoch !== audioEpoch) return;
  if (audioPlayer) audioPlayer.stop();
  audioPlayer = createAudioPlayer(url, {
    onStats({ buffer, bitrate }) {
      if (epoch !== audioEpoch) return;
      for (const [id, value, unit] of [['lcd-buffer', buffer, '%'], ['lcd-bitrate', bitrate, 'kbps']]) {
        if (value === undefined) continue;
        const element = document.getElementById(id);
        element.textContent = `${value === null ? '—' : value} ${unit}`;
        element.classList.toggle('dim', value === null || value === 0);
      }
    },
    onStopped() {
      if (epoch !== audioEpoch) return;
      audioPlaying = false; setPlayBtn(false); updateStatus();
    }
  });
  audioPlaying = !!audioPlayer;
  if (audioPlayer) audioPlayer.audio.volume = volume / 100;
}

function stopAudioPlayback() {
  audioEpoch++;
  audioPlaying = false;
  if (audioPlayer) { audioPlayer.stop(); audioPlayer = null; }
}

console.log('FM DX Console renderer loaded');

function showError(error) {
  serverErrorEl.textContent = error?.message || String(error);
  serverErrorEl.style.display = 'block';
  document.getElementById('selector-error').textContent = serverErrorEl.textContent;
}

async function connectToServer(value) {
  let url;
  try { url = normalizeUrl(value); } catch (error) { showError(error); return; }
  cleanup();
  currentUrl = url;
  urlInputEl.value = url;
  connecting = true;
  isConnected = false;
  document.getElementById('url-btn').textContent = 'Cancel';
  setConnectionStatus('Connecting...');
  serverErrorEl.textContent = '';
  document.getElementById('selector-error').textContent = '';
  try {
    await electronAPI.setUrl(url);
    document.getElementById('server-dialog').close();
  } catch (error) {
    connecting = false;
    setConnectionStatus('Disconnected');
    showError(error);
  }
}

window.handleConnectBtnClick = () => {
  if (isConnected || connecting) return electronAPI.disconnect().catch(showError);
  return connectToServer(urlInputEl.value);
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

unitSelectEl.addEventListener('change', () => {
  electronAPI.saveSignalUnit(unitSelectEl.value).catch(showError);
  if (currentData) updateUI();
});
const serverErrorEl = document.getElementById('server-error');
document.getElementById('url-btn').addEventListener('click', window.handleConnectBtnClick);

function applySettings(settings) {
  recentServers = settings.recentServers || [];
  unitSelectEl.value = settings.signalUnit || 'dBf';
  serverSelectEl.replaceChildren(new Option('Choose a recent server…', ''));
  for (const entry of recentServers) serverSelectEl.add(new Option(entry.name || entry.url, entry.url));
  serverSelectEl.value = currentUrl;
  renderServerChoices();
  if (currentData) updateUI();
}

function renderServerChoices() {
  const query = document.getElementById('server-query').value;
  const entries = serverSource === 'recent' ? filterRecentServers(recentServers, query)
    : filterServers(publicServers, { query, onlineOnly: document.getElementById('online-only').checked });
  const list = document.getElementById('history-list');
  list.replaceChildren();
  for (const entry of entries) list.add(new Option(`${entry.name || entry.url}${entry.city ? ' · ' + entry.city : ''} · ${entry.url}`, entry.url));
  if (entries.some(entry => entry.url === currentUrl)) list.value = currentUrl;
  else if (entries.length) list.selectedIndex = 0;
  document.getElementById('connect-selected-btn').disabled = !entries.length;
  document.getElementById('online-only').parentElement.hidden = serverSource === 'recent';
  document.getElementById('server-list-label').textContent = serverSource === 'recent'
    ? `Last ${recentServers.length} connected servers · newest first` : `${entries.length} public servers`;
}

function openServerSelector() {
  const dialog = document.getElementById('server-dialog');
  if (dialog.open) return;
  serverSource = 'recent';
  document.getElementById('server-query').value = '';
  document.getElementById('selector-error').textContent = '';
  document.getElementById('manual-server-url').value = currentUrl || localStorage.getItem('lastServer') || '';
  renderServerChoices();
  dialog.showModal();
}

async function browsePublicServers() {
  serverSource = 'public';
  document.getElementById('selector-error').textContent = 'Loading public servers…';
  try {
    const data = await electronAPI.getServerList();
    publicServers = data.dataset;
    document.getElementById('selector-error').textContent = '';
    renderServerChoices();
  } catch (error) { showError(error); }
}

serverSelectEl.addEventListener('change', () => { if (serverSelectEl.value) connectToServer(serverSelectEl.value); });
document.getElementById('choose-server-btn').onclick = openServerSelector;
document.getElementById('recent-servers-btn').onclick = () => { serverSource = 'recent'; renderServerChoices(); };
document.getElementById('public-servers-btn').onclick = browsePublicServers;
document.getElementById('server-query').oninput = renderServerChoices;
document.getElementById('online-only').onchange = renderServerChoices;
document.getElementById('close-selector-btn').onclick = () => document.getElementById('server-dialog').close();
const connectSelected = () => { const url = document.getElementById('history-list').value; if (url) connectToServer(url); };
document.getElementById('connect-selected-btn').onclick = connectSelected;
document.getElementById('history-list').ondblclick = connectSelected;
document.getElementById('history-list').onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); connectSelected(); } };
document.getElementById('connect-manual-btn').onclick = () => connectToServer(document.getElementById('manual-server-url').value);
document.getElementById('manual-server-url').onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); connectToServer(event.target.value); } };

function action(type, value) { return electronAPI.tunerAction(type, value).catch(showError); }

function updateTunerInfo(info) {
  tunerInfo = info;
  antNames = info.antNames || ['Default'];
  const bandwidth = document.getElementById('bandwidth-select');
  bandwidth.replaceChildren(...bandwidthProfile(info.tunerType).map(item => new Option(item.label, String(item.value))));
  document.getElementById('agc-select').disabled = tunerProfileKey(info.tunerType) !== 'si47xx';
  updateAntennaLabel();
  if (currentData) updateUI();
}

document.getElementById('agc-select').replaceChildren(...AGC_OPTIONS.map(item => new Option(item.label, String(item.value))));
document.getElementById('bandwidth-select').onchange = event => action('bandwidth', Number(event.target.value));
document.getElementById('agc-select').onchange = event => action('agc', Number(event.target.value));
document.getElementById('stereo-btn').onclick = () => action('stereo');
function setVolume(value) {
  const next = clampVolume(value);
  if (next === null) return;
  volume = next;
  document.getElementById('volume-control').value = volume;
  document.getElementById('volume-value').textContent = `${volume}%`;
  if (audioPlayer) audioPlayer.audio.volume = volume / 100;
}
document.getElementById('volume-control').oninput = event => setVolume(event.target.value);
document.getElementById('command-btn').onclick = () => { document.getElementById('command-dialog').showModal(); document.getElementById('command-input').focus(); };
document.getElementById('send-command-btn').onclick = async () => {
  const input = document.getElementById('command-input');
  if (!input.reportValidity()) return;
  await action('raw', input.value);
  document.getElementById('command-dialog').close();
};
document.getElementById('server-info-btn').onclick = () => {
  document.getElementById('server-info').textContent = `${tunerInfo.tunerName || ''}\n${tunerInfo.tunerDesc || ''}\nTuner: ${tunerInfo.tunerType || 'Unknown'}\nAntennas: ${antNames.join(', ')}\n${currentUrl}\nPing: ${lastPing ?? '—'} ms`;
  document.getElementById('info-dialog').showModal();
};

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

function setRtLine(id, label, text, isActive) {
  const el = document.getElementById(id);
  if (!el) return;
  const hasText = text && text.trim();
  el.classList.toggle('empty', !hasText);
  el.classList.toggle('active', !!isActive && !!hasText);
  el.innerHTML = `<span class="lcd-title-label">${label}</span><span class="lcd-rt-text">${hasText ? escapeHtml(text) : '—'}</span>`;
}

// PI may contain '?' nibbles where the parser is uncertain.
// Upstream dims the whole PI by 20% per '?'.
function renderPi(pi) {
  if (!pi) return '----';
  const qCount = (pi.match(/\?/g) || []).length;
  const opacity = Math.max(0, 1 - qCount * 0.2);
  return `<span style="opacity:${opacity}">${escapeHtml(pi.toUpperCase())}</span>`;
}

electronAPI.onSettings(applySettings);
electronAPI.onTunerInfo(updateTunerInfo);
electronAPI.onPing(ping => { lastPing = ping; updateStatus(); });
electronAPI.onInitArgs(args => {
  cleanup();
  currentUrl = args.url || '';
  urlInputEl.value = currentUrl;
  connecting = !!currentUrl;
  document.getElementById('url-btn').textContent = connecting ? 'Cancel' : 'Connect';
  setConnectionStatus(connecting ? 'Connecting...' : 'Disconnected');
});
electronAPI.onWsError(data => { showError(data.message); });
electronAPI.onReconnecting(info => {
  isConnected = false;
  connecting = true;
  setConnectionStatus(`Reconnecting in ${info.delayMs / 1000}s (attempt ${info.attempt})`);
});
electronAPI.onWsConnected(() => {
  connecting = false;
  isConnected = true;
  document.getElementById('url-btn').textContent = 'Disconnect';
  serverErrorEl.textContent = '';
  setConnectionStatus('Connected');
  fetchSpectrumData();
  if (autoPlayOnConnect) playBtn.click();
});
electronAPI.onWsData(raw => {
  currentData = JSON.parse(raw);
  pendingFrequency = null;
  updateUI();
});
electronAPI.onRdsAdvanced(data => {
  rdsAdvanced = data;
  renderAdvancedRds();
  if (currentData) updateUI();
});
electronAPI.onDisconnected(() => {
  connecting = isConnected = false;
  currentUrl = '';
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
    e.preventDefault();
    const overlay = document.getElementById('help-overlay');
    if (overlay) { overlay.remove(); return; }
    const dialog = document.querySelector('dialog[open]');
    if (dialog) { dialog.close(); return; }
    if (typing) document.activeElement.blur();
    openServerSelector();
    return;
  }
  if (typing) return;

  const shortcut = shortcutFor(e.key);
  if (!shortcut) return;
  e.preventDefault();
  if (shortcut.action) { action(shortcut.action, shortcut.value); return; }
  if (shortcut.audio) { playBtn.click(); return; }
  if (shortcut.volume) { setVolume(volume + shortcut.volume); return; }
  if (shortcut.mute) { setVolume(0); return; }
  if (shortcut.signalUnit) {
    unitSelectEl.value = nextSignalUnit(unitSelectEl.value);
    unitSelectEl.dispatchEvent(new Event('change')); return;
  }
  switch (shortcut.modal) {
    case 'recent': openServerSelector(); break;
    case 'freq': freqInputEl.focus(); freqInputEl.select(); break;
    case 'bandwidth': document.getElementById('bandwidth-select').focus(); break;
    case 'agc': document.getElementById('agc-select').focus(); break;
    case 'cmd': document.getElementById('command-btn').click(); break;
    case 'server': document.getElementById('server-info-btn').click(); break;
    case 'help': toggleHelpOverlay(); break;
    case 'rdsAdv': {
      const card = document.querySelector('.card-advanced');
      card.style.display = card.style.display === 'none' ? '' : 'none'; break;
    }
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
        ${SHORTCUTS.map(item => `<kbd>${escapeHtml(item.label || item.keys[0])}</kbd><span>${escapeHtml(item.description)}</span>`).join('')}
      </div>
      <div class="help-hint">Click anywhere to close</div>
    </div>`;
  overlay.addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
}

function updateUI() {
  if (!currentData) return;
  document.getElementById('bandwidth-select').value = String(currentData.bw ?? 0);
  document.getElementById('agc-select').value = String(currentData.agc ?? 0);
  document.getElementById('stereo-btn').classList.toggle('active', flagEnabled(currentData.stForced));
  updateAntennaLabel();
  const broadcast = broadcastModel(currentData, rdsAdvanced);

  // Filter buttons reflect server-confirmed state (not the local optimistic toggle)
  const imsBtn = document.getElementById('ims-btn');
  const eqBtn = document.getElementById('eq-btn');
  if (imsBtn) imsBtn.classList.toggle('active', flagEnabled(currentData.ims));
  if (eqBtn)  eqBtn.classList.toggle('active', flagEnabled(currentData.eq));

  // Frequency
  if (currentData.freq !== undefined && currentData.freq !== null) {
    const freq = parseFloat(currentData.freq);
    if (!isNaN(freq) && document.activeElement !== freqInputEl && !dragging) {
      freqInputEl.value = formatFrequency(freq);
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
      
      const disp = convertSignal(sig, unitSelectEl.value);
      const unit = unitLabel(unitSelectEl.value);
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
  const psClean = broadcast.ps;
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
      flag('TP', flagEnabled(currentData.tp)),
      flag('TA', flagEnabled(currentData.ta)),
      `<span class="lcd-flag${ms === 1 || ms === 0 ? ' active' : ''}">${msInner}</span>`,
      flag('ST', flagEnabled(currentData.st))
    ].join('');
  }

  // PI / PTY / AF / ECC / Country
  const pi = (typeof currentData.pi === 'string') ? currentData.pi : '';
  const ptyName = broadcast.ptyName;

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
      const mhz = broadcast.af.map(value => value.toFixed(1));
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
  setRtLine('lcd-rt-a', 'RT-A', broadcast.rtA, broadcast.rtFlag === 'A');
  setRtLine('lcd-rt-b', 'RT-B', broadcast.rtB, broadcast.rtFlag === 'B');

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
  const station = stationRows(currentData, { imperial: localStorage.getItem('imperialUnits') === 'true' });
  stationEl.textContent = station.some(row => row.value)
    ? station.map(row => `${row.label.padEnd(8)} ${row.value || '—'}`).join('\n')
    : 'No transmitter match';

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

function doTune(delta) { if (isConnected) action('tune-delta', delta); }

document.getElementById('up1').onclick = () => doTune(1000);
document.getElementById('down1').onclick = () => doTune(-1000);
document.getElementById('up01').onclick = () => doTune(100);
document.getElementById('down01').onclick = () => doTune(-100);
document.getElementById('up001').onclick = () => doTune(10);
document.getElementById('down001').onclick = () => doTune(-10);

document.getElementById('ims-btn').onclick = () => action('ims');
document.getElementById('eq-btn').onclick = () => action('eq');
document.getElementById('ant-btn').onclick = () => { action('antenna'); fetchSpectrumData(); };

document.getElementById('spectrum-btn').onclick = () => {
  fetchSpectrumData();
};

urlInputEl.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    document.getElementById('url-btn').click();
  }
});

function submitFrequency(force = false) {
  const frequency = parseFrequency(freqInputEl.value);
  if (frequency === null) {
    freqInputEl.setCustomValidity('Enter a frequency between 64 and 108 MHz');
    showError(freqInputEl.validationMessage);
    return;
  }
  freqInputEl.setCustomValidity('');
  if (!force && (frequency === pendingFrequency || frequency === Number(currentData?.freq))) return;
  pendingFrequency = frequency;
  action('tune', frequency);
}
freqInputEl.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); submitFrequency(true); } });
freqInputEl.addEventListener('blur', () => { if (isConnected) submitFrequency(); });
freqInputEl.addEventListener('input', () => freqInputEl.setCustomValidity(''));

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
  nextKhz = Math.max(64000, Math.min(108000, nextKhz));
  freqInputEl.value = (nextKhz / 1000).toFixed(3);
  action('tune', nextKhz / 1000);
  resetRdsUI();
}

freqInputEl.addEventListener('wheel', tuneByWheel, { passive: false });
const freqDisplayEl = document.querySelector('.freq-display');
if (freqDisplayEl) {
  freqDisplayEl.addEventListener('wheel', tuneByWheel, { passive: false });
}

// Spectrum
function cleanup() {
  audioPlaying = false;
  stopAudioPlayback();
  currentData = null;
  pendingFrequency = null;
  lastPing = null;
  freqInputEl.value = '---.---';
  resetRdsUI();
  setPlayBtn(false);
  rdsAdvanced = null;
  renderAdvancedRds();
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
    const url = currentUrl;
    const data = await electronAPI.getSpectrumData();
    if (!data || currentUrl !== url) return;
    const raw = data.sdFm || data.sd || '';
    if (!raw) return;
    spectrumData = parseSpectrumData(raw);
    drawSpectrum(spectrumData);
  } catch (e) {
    console.error('Spectrum fetch error:', e);
  }
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
  action('tune', freq);
}

const spectrumSvgEl = document.getElementById('spectrum-svg');
spectrumSvgEl.addEventListener('wheel', tuneByWheel, { passive: false });
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
  const element = document.getElementById('rds-adv');
  if (!rdsAdvanced) { element.textContent = ''; return; }
  const { d, ptyDisplay, longPs, ptyn, rtA, rtB, psClean, eon, rtPlusLines, odaList, indicators } = advancedRdsModel(rdsAdvanced);
  const lines = [
    `PI: ${d.pi || '—'}  PS: ${psClean}  PTY: ${ptyDisplay}`,
    `Long PS: ${longPs}  PTYN: ${ptyn}`,
    `RT-A: ${rtA}`, `RT-B: ${rtB}`,
    `TP: ${d.tp ? 1 : 0}  TA: ${d.ta ? 1 : 0}  M/S: ${d.ms == 1 ? 'Music' : d.ms == 0 ? 'Speech' : '—'}`,
    `DI: ${diLine(d)}`, `Stable: ${stableLine(d.stableFlags)}`,
    `Time: ${timeOnly(d.localTime)}  UTC: ${timeOnly(d.utcTime)}`,
    `ECC: ${d.ecc || '—'}  LIC: ${d.lic || '—'}  PIN: ${d.pin || '—'}`,
    `AF: ${summariseAf(d.afList || d.af, d.afType)}`,
    ...rtPlusLines.map(pair => 'RT+: ' + pair.map(tag => `${tag.label}: ${tag.text}`).join(' · ')),
    ...(eon ? [`EON: ${eon}`] : []),
    ...(odaList.length ? [`ODA: ${odaList.map(item => item.app || item.name || item.aid).join(', ')}`] : []),
    ...(indicators.length ? [`Has: ${indicators.join(' ')}`] : []),
    `BER: ${d.ber ?? '—'}  Groups: ${formatGroups(d.groupStats)}`,
  ];
  const tags = rtPlusLine(rdsAdvanced);
  if (tags?.song) lines.push(`Now: ${tags.song.title} — ${tags.song.artist}`);
  element.textContent = lines.join('\n');
}

async function initialize() {
  const initial = await electronAPI.getInitialState();
  appVersion = initial.version;
  document.getElementById('version').textContent = `v${appVersion}`;
  autoPlayOnConnect = initial.autoPlay;
  applySettings(initial);
  updateTunerInfo(tunerInfo);
  document.documentElement.dataset.ready = 'true';
  if (initial.url) await connectToServer(initial.url);
  else openServerSelector();
}
initialize().catch(showError);
