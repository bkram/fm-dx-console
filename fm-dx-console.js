#!/usr/bin/env node
//
// (c) Bkram 2024
// Console client for fm-dx-webserver

// -----------------------------
// Imports
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
// Global Constants
// -----------------------------
const europe_programmes = [
    "No PTY", "News", "Current Affairs", "Info",
    "Sport", "Education", "Drama", "Culture", "Science", "Varied",
    "Pop M", "Rock M", "Easy Listening", "Light Classical",
    "Serious Classical", "Other Music", "Weather", "Finance",
    "Children's Programmes", "Social Affairs", "Religion", "Phone-in",
    "Travel", "Leisure", "Jazz Music", "Country Music", "National Music",
    "Oldies Music", "Folk Music", "Documentary", "Alarm Test"
];
const version = '1.52';
const userAgent = `fm-dx-console/${version}`;

// Terminal must be at least 80x24
const MIN_COLS = 80;
const MIN_ROWS = 24;

// Throttle interval => 8 commands/sec
const THROTTLE_MS = 125;

// Style objects
const titleStyle = { fg: 'black', bg: 'green', bold: true };
const boxStyle = { border: { fg: 'green', bg: 'blue' }, bg: 'blue' };

// -----------------------------
// Global Variables
// -----------------------------
let jsonData = null;
let previousJsonData = null;
let tunerDesc = '';
let tunerName = '';
let antNames = [];
let websocketAudio;
let websocketData;
let argDebug = argv.debug;
let argUrl;
let pingTime = null;

// -----------------------------
// Logging Setup
// -----------------------------
const logFilePath = path.join(__dirname, 'console.log');
const logStream = fs.createWriteStream(logFilePath, { flags: 'w' });

function debugLog(...args) {
    if (argDebug) {
        const message = args.join(' ');
        logStream.write(message + '\n');
    }
}

// -----------------------------
// Argument Parsing
// -----------------------------
if (!argv.url) {
    console.error('Usage: node fm-dx-console.js --url <fm-dx> [--debug]');
    process.exit(1);
} else {
    argUrl = argv.url.toLowerCase().replace("#", "").replace("?", "");
}

function isValidURL(urlString) {
    try {
        new URL(urlString);
        return true;
    } catch (err) {
        return false;
    }
}

function formatWebSocketURL(url) {
    if (url.endsWith('/')) {
        url = url.slice(0, -1);
    }
    if (url.startsWith("http://")) {
        url = url.replace("http://", "ws://");
    } else if (url.startsWith("https://")) {
        url = url.replace("https://", "wss://");
    }
    return url;
}

if (isValidURL(argUrl)) {
    let websocketAddress = formatWebSocketURL(argUrl);
    websocketAudio = `${websocketAddress}/audio`;
    websocketData = `${websocketAddress}/text`;
} else {
    console.error("Invalid URL provided.");
    process.exit(1);
}

function convertToFrequency(num) {
    if (
      num === null ||
      num === undefined ||
      isNaN(Number(num.toString().replace(',', '.')))
    ) {
        return null;
    }
    num = parseFloat(num.toString().replace(',', '.'));
    while (num >= 100) {
        num /= 10;
    }
    if (num < 76) {
        num *= 10;
    }
    return Math.round(num * 10) / 10;
}

// -----------------------------
// Blessed Screen
// -----------------------------
const screen = blessed.screen({
    smartCSR: true,
    mouse: true,
    fullUnicode: true,
    dockBorders: true,
    style: { bg: 'blue' }
});
// Hide blinking terminal cursor which otherwise appears in the RDS box
screen.program.hideCursor();

// -----------------------------
// Throttling Queue
// -----------------------------
const commandQueue = [];

/**
 * Enqueues commands instead of sending them immediately.
 * This helps throttle sending to 8 commands/sec
 */
function enqueueCommand(cmd) {
    commandQueue.push(cmd);
}

/** Every 125 ms, send up to one command if ws is open */
setInterval(() => {
    if (commandQueue.length > 0 && ws && ws.readyState === WebSocket.OPEN) {
        const nextCmd = commandQueue.shift();
        debugLog('Sending command:', nextCmd);
        ws.send(nextCmd);
    }
}, THROTTLE_MS);

// -----------------------------
// Terminal Size Check
// If too small, hide UI and show warning
// -----------------------------
function checkSizeAndToggleUI() {
    const { cols, rows } = screen;
    if (cols < MIN_COLS || rows < MIN_ROWS) {
        uiBox.hide();
        warningBox.setContent(
            `\n   Terminal too small!\n\n` +
            `   Please resize to at least ${MIN_COLS}x${MIN_ROWS}\n`
        );
        warningBox.show();
    } else {
        warningBox.hide();
        uiBox.show();
    }
    screen.render();
}

// -----------------------------
// Helper UI Functions
// -----------------------------
/**
 * Generates bottom bar text with left side = variableString,
 * right side = "Press `h` for help"
 */
function genBottomText(variableString) {
    // Right-justify "Press `h` for help"
    const helpString = "Press `h` for help";
    const totalWidth = screen.cols - 2;
    const maxVariableLength = totalWidth - (helpString.length + 1);

    const truncatedVariableString =
        variableString.length > maxVariableLength
            ? variableString.substring(0, maxVariableLength)
            : variableString;

    const paddingLength =
        totalWidth - truncatedVariableString.length - helpString.length;

    return (
        ' ' +
        truncatedVariableString +
        ' '.repeat(Math.max(0, paddingLength)) +
        helpString
    );
}

/** Creates the content of the help box */
function generateHelpContent() {
    const leftCommands = [
        "'←'  decrease 0.1 MHz",
        "'↓'  decrease 0.01 MHz",
        "'z'  decrease 1 MHz",
        "'r'  refresh",
        "'p'  play audio",
        "'['  toggle iMS",
        "'y'  toggle antenna",
        "'s'  server info",
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

/**
 * Pads a string (with optional Blessed color tags)
 * to a certain width with trailing spaces
 */
function padStringWithSpaces(text, color = 'green', totalLength) {
    const tagRegex = /\{(.*?)\}/g;
    const strippedText = text.replace(tagRegex, '');
    const spacesToAdd = totalLength - strippedText.length;
    const trailing = Math.max(1, spacesToAdd);
    return (
        ' ' + `{${color}-fg}` + text + `{/${color}-fg}` + ' '.repeat(trailing)
    );
}

/**
 * Apply grey markup to characters with non-zero error counts
 */
function processStringWithErrors(str, errors) {
    if (!str) return '';
    const errArr = (errors || '').split(',').map(e => parseInt(e, 10) || 0);
    let out = '';
    for (let i = 0; i < str.length; i++) {
        const ch = str[i];
        if (errArr[i] > 0) {
            out += `{grey-fg}${ch}{/grey-fg}`;
        } else {
            out += ch;
        }
    }
    return out;
}

/** Returns a label string with bold, colored style */
function boxLabel(label) {
    return `{white-fg}{blue-bg}{bold}${label}{/bold}{/blue-bg}{/white-fg}`;
}

// -----------------------------
// UI Layout
// -----------------------------

// Main container for the entire UI
const uiBox = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    tags: true,
    style: { bg: 'blue' }
});

// Warning box if the terminal is too small
const warningBox = blessed.box({
    parent: screen,
    width: 50,
    height: 7,
    top: 'center',
    left: 'center',
    tags: true,
    border: 'line',
    style: boxStyle,
    label: '{blue-bg}{white-fg}{bold} Resize Needed {/bold}{/white-fg}{/blue-bg}',
    hidden: true,
    content: ''
});

// Single top bar with the title text + clock
const titleBar = blessed.box({
    parent: uiBox,
    top: 0,
    left: 0,
    width: '100%',
    height: 1,
    tags: true,
    style: titleStyle,
    content: ''
});

/**
 * Updates the top bar, placing the version text on the left
 * and the current time (plus trailing space) on the right.
 */
function updateTitleBar() {
    const leftText = ` fm-dx-console ${version} by Bkram `;
    // Clock with a space at the end
    const now = new Date();
    const clockStr = now.toLocaleTimeString([], { hour12: false }) + ' ';

    // Spacing so the clock is right-aligned
    const totalWidth = screen.cols;
    let spacing = totalWidth - (leftText.length + clockStr.length);
    if (spacing < 1) spacing = 1;

    titleBar.setContent(leftText + ' '.repeat(spacing) + clockStr);
}

// Tuner, RDS, Station sections
// Layout widths for 80x25 terminals
// Shrink the tuner and station boxes a little so RDS
// has enough room for ECC and AF data
// Place Tuner and RDS next to each other so everything fits in 80x25
// widen tuner and RDS boxes so their content fits properly
const tunerWidth = 24;
const rdsWidth = 28; // slightly smaller so overall layout fits nicely
const heightInRows = 8;
const rdsHeight = heightInRows + 2;
const rowHeight = Math.max(heightInRows, rdsHeight);

const tunerBox = blessed.box({
    parent: uiBox,
    top: 1,
    left: 0,
    width: tunerWidth,
    height: heightInRows,
    tags: true,
    border: { type: 'line' },
    style: boxStyle,
    label: boxLabel('Tuner'),
});

const rdsBox = blessed.box({
    parent: uiBox,
    top: 1,
    left: tunerWidth,
    width: rdsWidth,
    height: rdsHeight,
    tags: true,
    border: { type: 'line' },
    style: boxStyle,
    label: boxLabel('RDS'),
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
        ch: ' ',
        inverse: true
    },
});

const stationBox = blessed.box({
    parent: uiBox,
    top: 1,
    left: tunerWidth + rdsWidth,
    width: `100%-${tunerWidth + rdsWidth}`,
    height: heightInRows,
    tags: true,
    border: { type: 'line' },
    style: boxStyle,
    label: boxLabel('Station Information'),
});

// RDS Radiotext box
const rtBox = blessed.box({
    parent: uiBox,
    top: tunerBox.top + rowHeight, // below Tuner/RDS/Station row
    left: 0,
    width: '100%',
    height: 4,
    tags: true,
    border: { type: 'line' },
    style: boxStyle,
    label: boxLabel('RDS Radiotext')
});

// Signal + Stats boxes
const boxHeight = 5;

const signalBox = blessed.box({
    parent: uiBox,
    top: rtBox.top + rtBox.height,
    left: 0,
    width: '50%',
    height: boxHeight,
    tags: true,
    border: { type: 'line' },
    style: boxStyle,
    label: boxLabel('Signal'),
});

const progressBar = blessed.progressbar({
    parent: signalBox,
    top: 1,
    left: 2,
    width: '100%-5',
    height: 1,
    tags: true,
    style: {
        bar: { bg: 'red' }
    },
    filled: 0
});

const statsBox = blessed.box({
    parent: uiBox,
    top: rtBox.top + rtBox.height,
    left: '50%',
    width: '50%',
    height: boxHeight,
    tags: true,
    border: { type: 'line' },
    style: boxStyle,
    label: boxLabel('Statistics'),
});

// Server Info popup (hidden by default)
const serverBox = blessed.box({
    parent: uiBox,
    top: 'center',
    left: 'center',
    width: '80%',
    height: '80%',
    tags: true,
    border: { type: 'line' },
    style: boxStyle,
    label: boxLabel('Server Info'),
    hidden: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
        ch: ' ',
        inverse: true
    }
});

// Bottom bar with "Press `h` for help" on the right
const bottomBox = blessed.box({
    parent: uiBox,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 1,
    tags: true,
    style: titleStyle,
    content: genBottomText(argUrl)
});

// Help box in the center
const helpBox = blessed.box({
    parent: uiBox,
    top: 'center',
    left: 'center',
    width: '80%',
    height: '80%',
    border: { type: 'line' },
    style: boxStyle,
    label: boxLabel('Help'),
    content: generateHelpContent(),
    tags: true,
    hidden: true
});

// Render once
screen.render();

// Update the title bar every second (for the clock)
setInterval(() => {
    updateTitleBar();
    screen.render();
}, 1000);

/**
 * Adjust the progress bar width after a resize
 */
function updateProgressBarWidth() {
    progressBar.width = signalBox.width - 5;
}

/**
 * On terminal resize, we re-check if UI is too small,
 * recalc the bottom bar, recalc the title bar, etc.
 */
screen.on('resize', () => {
    updateProgressBarWidth();
    checkSizeAndToggleUI();

    // Recompute the bottom bar text to keep "Press `h` for help" right-aligned
    bottomBox.setContent(genBottomText(argUrl));

    // Recompute the top bar clock spacing
    updateTitleBar(); 

    screen.render();
});

// -----------------------------
// UI update functions
// -----------------------------
function updateTunerBox(data) {
    if (!tunerBox || !data) return;
    const padLength = 8;
    const signalValue = parseFloat(data.sig);
    const signalDisplay = isNaN(signalValue) ? 'N/A' : `${signalValue.toFixed(1)} dBf`;

    tunerBox.setContent(
        `${padStringWithSpaces("Freq:", 'green', padLength)}${data.freq} MHz\n` +
        `${padStringWithSpaces("Signal:", 'green', padLength)}${signalDisplay}\n` +
        `${padStringWithSpaces("Mode:", 'green', padLength)}${data.st ? "Stereo" : "Mono"}\n` +
        `${padStringWithSpaces("iMS:", 'green', padLength)}${Number(data.ims) ? "On" : "{grey-fg}Off{/grey-fg}"}\n` +
        `${padStringWithSpaces("EQ:", 'green', padLength)}${Number(data.eq) ? "On" : "{grey-fg}Off{/grey-fg}"}\n` +
        `${padStringWithSpaces("ANT:", 'green', padLength)}${antNames[data.ant] || 'N/A'}\n`
    );
}

function updateRdsBox(data) {
    if (!rdsBox || !data) return;
    // Use a slightly wider prefix column so all values line up
    const padLength = 9;
    if (data.freq >= 75 && data.pi !== "?") {
        let msshow;
        if (data.ms === 0) {
            msshow = '{grey-fg}M{/grey-fg}S';
        } else if (data.ms === -1) {
            msshow = '{grey-fg}M{/grey-fg}{grey-fg}S{/grey-fg}';
        } else {
            msshow = 'M{grey-fg}S{/grey-fg}';
        }

        const psDisplay = processStringWithErrors(data.ps.trimStart(), data.ps_errors);
        const prefix = (txt) => padStringWithSpaces(txt, 'green', padLength);
        const lines = [];

        lines.push(`${prefix('PS:')}${psDisplay}`);
        lines.push(`${prefix('PI:')}${data.pi}`);
        if (data.ecc) {
            lines.push(`${prefix('ECC:')}${data.ecc}`);
        }
        const country = data.country_name || data.country_iso;
        if (country) {
            lines.push(`${prefix('Country:')}${country}`);
        }
        lines.push(
            `${prefix('Flags:')}` +
            `${data.tp ? 'TP' : '{grey-fg}TP{/grey-fg}'} ` +
            `${data.ta ? 'TA' : '{grey-fg}TA{/grey-fg}'} ` +
            `${msshow}`
        );
        const ptyNum = data.pty !== undefined ? data.pty : 0;
        lines.push(`${prefix('PTY:')}${ptyNum}`);
        lines.push(`${prefix('PTY txt:')}${europe_programmes[ptyNum] || 'None'}`);
        if (data.dynamic_pty !== undefined || data.artificial_head !== undefined || data.compressed !== undefined) {
            lines.push(`${prefix('DI:')}DP:${data.dynamic_pty ? 'On' : 'Off'} AH:${data.artificial_head ? 'On' : 'Off'} C:${data.compressed ? 'On' : 'Off'} Stereo:${data.st ? 'Yes' : 'No'}`);
        }
        if (Array.isArray(data.af) && data.af.length) {
            lines.push(`${prefix('AF:')}Yes`);
        } else {
            lines.push(`${prefix('AF:')}None`);
        }

        rdsBox.setContent(lines.join('\n'));
        screen.render();
    } else {
        const prefix = (txt) => padStringWithSpaces(txt, 'green', padLength);
        const placeholders = [
            `${prefix('PS:')}`,
            `${prefix('PI:')}`,
            `${prefix('ECC:')}`,
            `${prefix('Country:')}`,
            `${prefix('Flags:')}{grey-fg}TP{/grey-fg} {grey-fg}TA{/grey-fg} {grey-fg}M{/grey-fg}{grey-fg}S{/grey-fg}`,
            `${prefix('PTY:')}`,
            `${prefix('PTY txt:')}`,
            `${prefix('DI:')}`,
            `${prefix('AF:')}`
        ];
        rdsBox.setContent(placeholders.join('\n'));
    }
}

function updateRTBox(data) {
    if (!rtBox || !data) return;
    const line1 = processStringWithErrors(data.rt0 ? data.rt0.trim() : '\xA0', data.rt0_errors);
    const line2 = processStringWithErrors(data.rt1 ? data.rt1.trim() : '\xA0', data.rt1_errors);
    rtBox.setContent(
        `{center}${line1}{/center}\n` +
        `{center}${line2}{/center}`
    );
}

function updateStationBox(txInfo) {
    if (!stationBox || !txInfo) return;
    const padLength = 10;
    if (txInfo.tx) {
        const locParts = (txInfo.city || '').split(',');
        const location = locParts[0] ? locParts[0].trim() : '';
        const country = locParts.length > 1 ? locParts.slice(1).join(',').trim() : (txInfo.itu || '');

        stationBox.setContent(
            `${padStringWithSpaces("Name:", 'green', padLength)}${txInfo.tx}\n` +
            `${padStringWithSpaces("Location:", 'green', padLength)}${location}\n` +
            `${padStringWithSpaces("Country:", 'green', padLength)}${country}\n` +
            `${padStringWithSpaces("Distance:", 'green', padLength)}${txInfo.dist + " km"}\n` +
            `${padStringWithSpaces("Power:", 'green', padLength)}${txInfo.erp + " kW " + "[" + txInfo.pol + "]"}\n` +
            `${padStringWithSpaces("Azimuth:", 'green', padLength)}${txInfo.azi + "°"}`
        );
    } else {
        stationBox.setContent(
            `${padStringWithSpaces('Name:', 'green', padLength)}\n` +
            `${padStringWithSpaces('Location:', 'green', padLength)}\n` +
            `${padStringWithSpaces('Country:', 'green', padLength)}\n` +
            `${padStringWithSpaces('Distance:', 'green', padLength)}\n` +
            `${padStringWithSpaces('Power:', 'green', padLength)}\n` +
            `${padStringWithSpaces('Azimuth:', 'green', padLength)}`
        );
    }
}

function updateStatsBox(data) {
    if (!statsBox || !data) return;
    statsBox.setContent(
        `{center}Server users: ${data.users}\n` +
        `Server ping: ${pingTime !== null ? pingTime + ' ms' : ''}\n` +
        `Local audio: ${player.getStatus() ? "Playing" : "Stopped"}{/center}`
    );
}

function scaleValue(value) {
    const maxvalue = 130;
    value = Math.max(0, Math.min(maxvalue, value));
    return Math.floor((value / maxvalue) * 100);
}

function updateSignal(signal) {
    if (!progressBar) return;
    progressBar.setProgress(scaleValue(signal));
}

/**
 * Update the Server Box
 * - If terminal is too small, show just tunerName
 * - Otherwise, show tunerName + blank line + tunerDesc
 */
function updateServerBox() {
    if (!serverBox) return;
    if (!tunerName && !tunerDesc) {
        serverBox.setContent('');
        return;
    }
    if (screen.rows <= 25) {
        serverBox.setContent(tunerName);
    } else {
        // Add a leading space for aesthetics
        serverBox.setContent(` ${tunerName}\n\n${tunerDesc}`);
    }
}

// -----------------------------
// Audio
// -----------------------------
const player = playAudio(websocketAudio, userAgent, 2048, argv.debug);

// -----------------------------
// Tuner Info + Ping
// -----------------------------
async function tunerInfo() {
    try {
        const result = await getTunerInfo(argUrl);
        tunerName = result.tunerName || '';
        tunerDesc = result.tunerDesc || '';
        antNames = result.antNames || [];

        updateServerBox();
        screen.render();
    } catch (error) {
        debugLog(error.message);
    }
}
tunerInfo();

async function doPing() {
    try {
        pingTime = await getPingTime(argUrl);
        debugLog('Ping Time:', pingTime, 'ms');
        if (jsonData) {
            updateStatsBox(jsonData);
            screen.render();
        }
    } catch (error) {
        debugLog('Ping Error:', error.message);
    }
}
doPing();
setInterval(doPing, 5000);

// -----------------------------
// WebSocket Setup
// -----------------------------
const wsOptions = userAgent ? { headers: { 'User-Agent': `${userAgent} (control)` } } : {};
const ws = new WebSocket(websocketData, wsOptions);

ws.on('open', () => {
    debugLog('WebSocket connection established');
});

ws.on('message', (data) => {
    try {
        const newData = JSON.parse(data);
        if (JSON.stringify(newData) !== JSON.stringify(previousJsonData)) {
            jsonData = newData;
            updateTunerBox(jsonData);
            updateRdsBox(jsonData);
            updateSignal(jsonData.sig);
            updateStationBox(jsonData.txInfo);
            updateRTBox(jsonData);
            updateStatsBox(jsonData);
            updateServerBox();

            screen.render();
        }
        previousJsonData = newData;
    } catch (error) {
        debugLog('Error parsing JSON:', error);
    }
});

ws.on('close', () => {
    debugLog('WebSocket connection closed');
});

// -----------------------------
// Key Bindings
// -----------------------------
screen.on('keypress', async (ch, key) => {
    if (key.full === 'left') {
        if (jsonData && jsonData.freq) {
            enqueueCommand(`T${(jsonData.freq * 1000) - 100}`);
        }
    } else if (key.full === 'right') {
        if (jsonData && jsonData.freq) {
            enqueueCommand(`T${(jsonData.freq * 1000) + 100}`);
        }
    } else if (key.full === 'up') {
        if (jsonData && jsonData.freq) {
            enqueueCommand(`T${(jsonData.freq * 1000) + 10}`);
        }
    } else if (key.full === 'down') {
        if (jsonData && jsonData.freq) {
            enqueueCommand(`T${(jsonData.freq * 1000) - 10}`);
        }
    } else if (key.full === 'x') {
        if (jsonData && jsonData.freq) {
            enqueueCommand(`T${(jsonData.freq * 1000) + 1000}`);
        }
    } else if (key.full === 'z') {
        if (jsonData && jsonData.freq) {
            enqueueCommand(`T${(jsonData.freq * 1000) - 1000}`);
        }
    } else if (key.full === 'r') {
        if (jsonData && jsonData.freq) {
            enqueueCommand(`T${(jsonData.freq * 1000)}`);
        }
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
        dialog.input('\n  Enter frequency in MHz', '', (err, value) => {
            if (!err) {
                const newFreq = parseFloat(convertToFrequency(value)) * 1000;
                if (!isNaN(newFreq)) {
                    enqueueCommand(`T${newFreq}`);
                } else {
                    debugLog('Invalid frequency input.');
                }
            }
            dialog.destroy();
            screen.restoreFocus();
            screen.render();
        });
    } else if (key.full === 'h') {
        // Toggle the help box
        helpBox.hidden = !helpBox.hidden;
        screen.render();
    } else if (key.full === 'p') {
        // Toggle audio
        if (player.getStatus()) {
            player.stop();
        } else {
            player.play();
        }
        if (jsonData) {
            updateStatsBox(jsonData);
            screen.render();
        }
    } else if (key.full === '[') {
        // Toggle iMS
        if (jsonData && jsonData.ims == 1) {
            enqueueCommand(`G${jsonData.eq}0`);
        } else if (jsonData) {
            enqueueCommand(`G${jsonData.eq}1`);
        }
    } else if (key.full === ']') {
        // Toggle EQ
        if (jsonData && jsonData.eq == 1) {
            enqueueCommand(`G0${jsonData.ims}`);
        } else if (jsonData) {
            enqueueCommand(`G1${jsonData.ims}`);
        }
    } else if (key.full === 'y') {
        // Toggle antenna
        if (jsonData) {
            let newAnt = parseInt(jsonData.ant) + 1;
            if (newAnt >= antNames.length) {
                newAnt = 0;
            }
            enqueueCommand(`Z${newAnt}`);
        }
    } else if (key.full === 's') {
        // Toggle server info popup
        serverBox.hidden = !serverBox.hidden;
        if (!serverBox.hidden) {
            await tunerInfo();
            updateServerBox();
        } else {
            serverBox.setContent('');
            screen.realloc();
        }
        screen.render();
    } else if (key.full === 'escape' || key.full === 'C-c') {
        process.exit(0);
    } else {
        debugLog(key.full);
    }
});

// -----------------------------
// Final Initialization
// -----------------------------
checkSizeAndToggleUI();
updateTitleBar();     // Initial top bar update
updateServerBox();    // Fill server info if tuner info is already loaded
