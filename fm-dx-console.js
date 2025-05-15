#!/usr/bin/env node
//
// (c) Bkram 2024
// Console client for fm-dx-webserver

// -----------------------------
const argv = require('minimist')(process.argv.slice(2), {
    string: ['url'],
    boolean: ['debug']
});
const blessed = require('blessed');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const { getTunerInfo, getPingTime } = require('./tunerinfo');
const playAudio = require('./3lasclient');

// -----------------------------
// Constants
// -----------------------------
const europe_programmes = [
    "No PTY", "News", "Current Affairs", "Info", "Sport", "Education", "Drama", "Culture", "Science", "Varied",
    "Pop M", "Rock M", "Easy Listening", "Light Classical", "Serious Classical", "Other Music", "Weather", "Finance",
    "Children's Programmes", "Social Affairs", "Religion", "Phone-in", "Travel", "Leisure", "Jazz Music",
    "Country Music", "National Music", "Oldies Music", "Folk Music", "Documentary", "Alarm Test", "Alarm",
];
const version = '1.51';
const userAgent = `fm-dx-console/${version}`;
const MIN_COLS = 80;
const MIN_ROWS = 24;
const THROTTLE_MS = 125;
const titleStyle = { fg: 'black', bg: 'green', bold: true };
const boxStyle = { border: { fg: 'green', bg: 'blue' }, bg: 'blue' };

// -----------------------------
// State
// -----------------------------
let jsonData = null;
let prevData = null;
let tunerName = '';
let tunerDesc = '';
let antNames = [];
let pingTime = null;
let websocketAudio;
let websocketData;
const argDebug = argv.debug;
let argUrl;

// -----------------------------
// Logging
// -----------------------------
const logStream = fs.createWriteStream(path.join(__dirname, 'console.log'), { flags: 'w' });
function debugLog(...args) {
    if (argDebug) logStream.write(args.join(' ') + '\n');
}

// -----------------------------
// Argument Parsing
// -----------------------------
if (!argv.url) {
    console.error('Usage: node fm-dx-console.js --url <fm-dx> [--debug]');
    process.exit(1);
}
argUrl = argv.url.toLowerCase().replace(/[#?]/g, '');

function isValidURL(u) {
    try { new URL(u); return true; } catch { return false; }
}
function formatWS(u) {
    if (u.endsWith('/')) u = u.slice(0, -1);
    if (u.startsWith('http://')) return u.replace('http://', 'ws://');
    if (u.startsWith('https://')) return u.replace('https://', 'wss://');
    return u;
}

if (isValidURL(argUrl)) {
    const addr = formatWS(argUrl);
    websocketAudio = `${addr}/audio`;
    websocketData = `${addr}/text`;
} else {
    console.error('Invalid URL');
    process.exit(1);
}

function convertToFrequency(n) {
    if (n == null || isNaN(Number(n.toString().replace(',', '.')))) return null;
    let f = parseFloat(n.toString().replace(',', '.'));
    while (f >= 100) f /= 10;
    if (f < 76) f *= 10;
    return Math.round(f * 10) / 10;
}

// -----------------------------
// Blessed Screen Setup
// -----------------------------
const screen = blessed.screen({
    smartCSR: true,
    mouse: true,
    fullUnicode: true,
    dockBorders: true,
    style: { bg: 'blue' }
});

// -----------------------------
// Command Queue
// -----------------------------
const commandQueue = [];
function enqueueCommand(cmd) { commandQueue.push(cmd); }
setInterval(() => {
    if (commandQueue.length && ws && ws.readyState === WebSocket.OPEN) {
        const cmd = commandQueue.shift();
        debugLog('Sending command:', cmd);
        ws.send(cmd);
    }
}, THROTTLE_MS);

// -----------------------------
// UI Helpers
// -----------------------------
function checkSize() {
    const { cols, rows } = screen;
    if (cols < MIN_COLS || rows < MIN_ROWS) {
        uiBox.hide();
        warningBox.setContent(
            `\n   Terminal too small!\n\n   Please resize to ${MIN_COLS}x${MIN_ROWS}`
        );
        warningBox.show();
    } else {
        warningBox.hide();
        uiBox.show();
    }
    screen.render();
}

function genBottom(url) {
    const help = 'Press `h` for help';
    const tot = screen.cols - 2;
    const max = tot - (help.length + 1);
    let v = url;
    if (v.length > max) v = v.slice(0, max);
    const pad = tot - v.length - help.length;
    return ' ' + v + ' '.repeat(Math.max(0, pad)) + help;
}

function pad(txt, col, len) {
    const stripped = txt.replace(/\{.*?\}/g, '');
    const sp = len - stripped.length;
    if (sp <= 0) return txt;
    return ' ' + `{${col}-fg}` + txt + `{/${col}-fg}` + ' '.repeat(sp);
}

function boxLabel(txt) {
    return `{white-fg}{blue-bg}{bold}${txt}{/bold}{/blue-bg}{/white-fg}`;
}

/** Creates the content of the help box */
function helpText() {
    const leftCommands = [
        "'←'  decrease 0.1 MHz",
        "'↓'  decrease 0.01 MHz",
        "'z'  decrease 1 MHz",
        "'r'  refresh",
        "'p'  play audio",
        "'['  toggle iMS",
        "'y'  toggle antenna",
    ];

    const rightCommands = [
        "'→'  increase 0.1 MHz",
        "'↑'  increase 0.01 MHz",
        "'x'  increase 1 MHz",
        "'t'  set frequency",
        "']'  toggle EQ",
        "'Esc'  quit",
        "'h'  toggle help",
    ];

    let helpContent = '  Press key to:\n\n';
    for (let i = 0; i < leftCommands.length; i++) {
        const leftCmd = leftCommands[i];
        const rightCmd = rightCommands[i] || '';
        const leftPadded = leftCmd.padEnd(27);
        helpContent += `  ${leftPadded}  ${rightCmd}\n`;
    }
    return helpContent;
}


// -----------------------------
// UI Layout
// -----------------------------
const uiBox = blessed.box({ parent: screen, top: 0, left: 0, width: '100%', height: '100%', tags: true, style: { bg: 'blue' } });
const warningBox = blessed.box({ parent: uiBox, width: 50, height: 7, top: 'center', left: 'center', tags: true, border: 'line', style: boxStyle, label: boxLabel('Resize'), hidden: true });
const titleBar = blessed.box({ parent: uiBox, top: 0, left: 0, width: '100%', height: 1, tags: true, style: titleStyle });
const tunerBox = blessed.box({ parent: uiBox, top: 1, left: 0, width: 24, height: 8, tags: true, border: 'line', style: boxStyle, label: boxLabel('Tuner') });
const rdsBox = blessed.box({ parent: uiBox, top: 1, left: 24, width: 17, height: 8, tags: true, border: 'line', style: boxStyle, label: boxLabel('RDS') });
const stationBox = blessed.box({ parent: uiBox, top: 1, left: 41, width: '100%-41', height: 8, tags: true, border: 'line', style: boxStyle, label: boxLabel('Station Information') });
const rtBox = blessed.box({ parent: uiBox, top: 9, left: 0, width: '100%', height: 4, tags: true, border: 'line', style: boxStyle, label: boxLabel('RDS Radiotext') });
const afBox = blessed.box({ parent: uiBox, top: 13, left: 0, width: '100%', height: 3, tags: true, border: 'line', style: boxStyle, label: boxLabel('RDS AF') });
const signalBox = blessed.box({ parent: uiBox, top: 16, left: 0, width: '50%', height: 5, tags: true, border: 'line', style: boxStyle, label: boxLabel('Signal') });
const progressBar = blessed.progressbar({ parent: signalBox, top: 1, left: 2, width: '100%-5', height: 1, tags: true, style: { bar: { bg: 'red' } }, filled: 0 });
const statsBox = blessed.box({ parent: uiBox, top: 16, left: '50%', width: '50%', height: 5, tags: true, border: 'line', style: boxStyle, label: boxLabel('Stats') });
const serverBox = blessed.box({ parent: uiBox, top: 21, left: 0, width: '100%', bottom: 1, tags: true, border: 'line', style: boxStyle, label: boxLabel('Server Info'), scrollable: true, alwaysScroll: true, scrollbar: { ch: ' ', inverse: true } });
const bottomBox = blessed.box({ parent: uiBox, bottom: 0, left: 0, width: '100%', height: 1, tags: true, style: titleStyle, content: genBottom(argUrl) });
const helpBox = blessed.box({ parent: uiBox, top: 'center', left: 'center', width: 60, height: 18, border: 'line', style: boxStyle, label: boxLabel('Help'), content: helpText(), tags: true, hidden: true });
screen.render();
setInterval(() => { updateTitleBar(); screen.render(); }, 1000);
screen.on('resize', () => { progressBar.width = signalBox.width - 5; checkSize(); bottomBox.setContent(genBottom(argUrl)); updateTitleBar(); screen.render(); });

// -----------------------------
// Update Functions
// -----------------------------
function updateTitleBar() {
    const now = new Date().toLocaleTimeString([], { hour12: false }) + ' ';
    const left = ` fm-dx-console ${version} by Bkram `;
    let space = screen.cols - (left.length + now.length);
    if (space < 1) space = 1;
    titleBar.setContent(left + ' '.repeat(space) + now);
}

function updateTunerBox(d) {
    if (!tunerBox || !d) return;
    const p = 8;
    const sigVal = parseFloat(d.sig);
    tunerBox.setContent(
        `${pad('Freq:', 'green', p)}${d.freq} MHz\n` +
        `${pad('Signal:', 'green', p)}${isNaN(sigVal) ? 'N/A' : sigVal.toFixed(1) + ' dBf'}\n` +
        `${pad('Mode:', 'green', p)}${d.st ? 'Stereo' : 'Mono'}\n` +
        `${pad('iMS:', 'green', p)}${d.ims ? 'On' : '{grey-fg}Off{/grey-fg}'}\n` +
        `${pad('EQ:', 'green', p)}${d.eq ? 'On' : '{grey-fg}Off{/grey-fg}'}\n` +
        `${pad('ANT:', 'green', p)}${antNames[d.ant] || 'N/A'}`
    );
}

function updateRdsBox(d) {
    if (!rdsBox || !d) return;
    const padL = 5;
    const has = d.freq >= 75 && d.pi !== '?';
    const ps = has ? d.ps.trim() : '';
    const pi = has ? d.pi : '';
    const ecc = has && d.ecc != null ? d.ecc : '';
    let msi;
    if (!has) msi = '{grey-fg}M{/grey-fg}{grey-fg}S{/grey-fg}';
    else if (d.ms === 0) msi = '{grey-fg}M{/grey-fg}S';
    else if (d.ms === -1) msi = '{grey-fg}M{/grey-fg}{grey-fg}S{/grey-fg}';
    else msi = 'M{grey-fg}S{/grey-fg}';
    const tp = has && d.tp ? 'TP' : '{grey-fg}TP{/grey-fg}';
    const ta = has && d.ta ? 'TA' : '{grey-fg}TA{/grey-fg}';
    const pty = has ? europe_programmes[d.pty] : '';
    rdsBox.setContent(
        `${pad('PS:', 'green', padL)}${ps}\n` +
        `${pad('PI:', 'green', padL)}${pi}\n` +
        `${pad('ECC:', 'green', padL)}${ecc}\n` +
        `{center}{bold}Flags{/bold}\n` +
        `${tp} ${ta} ${msi}\n` +
        `${pty}{/center}`
    );
}

function updateRTBox(d) {
    if (!rtBox || !d) return;
    rtBox.setContent(
        `{center}${d.rt0.trim()}{/center}\n` +
        `{center}${d.rt1.trim()}{/center}`
    );
}

function updateAfBox(d) {
    if (!afBox) return;
    if (Array.isArray(d.af) && d.af.length) {
        const list = d.af.map(f => (f / 1000).toFixed(2)).join(', ');
        afBox.setContent(' ' + list);
    } else {
        afBox.setContent(' No alternative frequencies available.');
    }
    afBox.show();
}

function updateSignal(sig) {
    if (!progressBar) return;
    const v = Math.max(0, Math.min(130, sig));
    progressBar.setProgress(Math.floor(v / 130 * 100));
}

function updateStatsBox(d) {
    if (!statsBox || !d) return;
    statsBox.setContent(
        `${pad('Users:', 'green', 8)}${d.users}\n` +
        `${pad('Ping:', 'green', 8)}${pingTime || 'N/A'} ms\n` +
        `${pad('Audio:', 'green', 8)}${player.getStatus() ? 'On' : 'Off'}`
    );
}

function updateStationBox(tx) {
    if (!stationBox || !tx) return;
    if (tx.tx) {
        stationBox.setContent(
            `${pad('Name:', 'green', 10)}${tx.tx}\n` +
            `${pad('Loc:', 'green', 10)}${tx.city}, ${tx.itu}\n` +
            `${pad('Dist:', 'green', 10)}${tx.dist} km\n` +
            `${pad('Power:', 'green', 10)}${tx.erp} kW [${tx.pol}]\n` +
            `${pad('Azimuth:', 'green', 10)}${tx.azi}°`
        );
    } else stationBox.setContent('');
}

// -----------------------------
// Update Server Box
// -----------------------------
function updateServerBox() {
    if (!serverBox) return;
    if (screen.rows <= MIN_ROWS + 1) {
        serverBox.setContent(tunerName);
    } else {
        serverBox.setContent(` ${tunerName}

${tunerDesc}`);
    }
}


// -----------------------------
// Audio & Ping
// -----------------------------
const player = playAudio(websocketAudio, userAgent, 2048, argDebug);

async function tunerInfo() {
    try {
        const res = await getTunerInfo(argUrl);
        tunerName = res.tunerName;
        tunerDesc = res.tunerDesc;
        antNames = res.antNames;
        updateServerBox(); screen.render();
    } catch (e) { debugLog(e); }
}

async function doPing() {
    try {
        pingTime = await getPingTime(argUrl);
        if (jsonData) { updateStatsBox(jsonData); screen.render(); }
    } catch (e) { debugLog(e); }
}

doPing();
setInterval(doPing, 5000);
tunerInfo();

// -----------------------------
// WebSocket Connection
// -----------------------------
const ws = new WebSocket(websocketData, { headers: { 'User-Agent': `${userAgent} (control)` } });
ws.on('open', () => debugLog('WebSocket open'));
ws.on('message', (msg) => {
    try {
        const d = JSON.parse(msg);
        if (JSON.stringify(d) !== JSON.stringify(prevData)) {
            jsonData = d;
            updateTunerBox(d);
            updateRdsBox(d);
            updateRTBox(d);
            updateAfBox(d);
            updateSignal(d.sig);
            updateStationBox(d.txInfo);
            updateStatsBox(d);
            updateServerBox();
            screen.render();
        }
        prevData = d;
    } catch (e) { debugLog(e); }
});
ws.on('close', () => debugLog('WebSocket closed'));

// -----------------------------
// Key Bindings
// -----------------------------
screen.on('keypress', (ch, key) => {
    if (!jsonData || !key.full) return;
    const freq = jsonData.freq * 1000;
    if (key.full === 'left') {
        enqueueCommand(`T${freq - 100}`);
    } else if (key.full === 'right') {
        enqueueCommand(`T${freq + 100}`);
    } else if (key.full === 'up') {
        enqueueCommand(`T${freq + 10}`);
    } else if (key.full === 'down') {
        enqueueCommand(`T${freq - 10}`);
    } else if (key.full === 'x') {
        enqueueCommand(`T${freq + 1000}`);
    } else if (key.full === 'z') {
        enqueueCommand(`T${freq - 1000}`);
    } else if (key.full === 'r') {
        enqueueCommand(`T${freq}`);
    } else if (key.full === 't') {
        // Direct freq input
        screen.saveFocus();
        const dialog = blessed.prompt({
            parent: uiBox,
            top: 'center',
            left: 'center',
            width: 30,
            height: 8,
            border: 'line',
            style: boxStyle,
            label: boxLabel('Direct Tuning'),
            tags: true
        });
        dialog.input('Enter frequency in MHz', '', (err, value) => {
            if (!err) {
                const f = convertToFrequency(value);
                if (f) enqueueCommand(`T${f * 1000}`);
                else debugLog('Invalid frequency input.');
            }
            dialog.destroy();
            screen.restoreFocus();
            screen.render();
        });
    } else if (key.full === 'h') {
        helpBox.hidden = !helpBox.hidden;
        screen.render();
    } else if (key.full === 'p') {
        if (player.getStatus()) player.stop(); else player.play();
        updateStatsBox(jsonData);
        screen.render();
    } else if (key.full === '[') {
        // Toggle iMS
        if (jsonData.ims != null && jsonData.eq != null) {
            const newIms = jsonData.ims ? 0 : 1;
            enqueueCommand(`G${jsonData.eq}${newIms}`);
        }
    } else if (key.full === ']') {
        // Toggle EQ
        if (jsonData.eq != null && jsonData.ims != null) {
            const newEq = jsonData.eq ? 0 : 1;
            enqueueCommand(`G${newEq}${jsonData.ims}`);
        }
    } else if (key.full === 'y') {
        let na = (parseInt(jsonData.ant) + 1) % antNames.length;
        enqueueCommand(`Z${na}`);
    } else if (key.full === 'escape' || key.full === 'C-c') {
        process.exit(0);
    } else {
        debugLog(key.full);
    }
});

// -----------------------------
// Final Initialization
// -----------------------------
checkSize();
updateTitleBar();
updateServerBox();