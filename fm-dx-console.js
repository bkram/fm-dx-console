#!/usr/bin/env node
//
// (c) Bkram 2024
// Console client for fm-dx-webserver

// -----------------------------
// Imports
// -----------------------------
const argv = require('minimist')(process.argv.slice(2), {
    string: ['url'],
    boolean: ['debug', 'auto-play', 'help']
});
const blessed = require('blessed');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const { getTunerInfo, getPingTime } = require('./tunerinfo');
const { setAntNames, getAntNames, getAntLabel, cycleAntenna } = require('./antenna');
const { Worker } = require('worker_threads');

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
const version = '1.53';
const userAgent = `fm-dx-console/${version}`;

// Terminal must be at least 80x24
const MIN_COLS = 80;
const MIN_ROWS = 24;

function getMinCols() {
    const mode = getLayoutMode();
    return mode === 'compact' ? 70 : 80;
}

function getMinRows() {
    const mode = getLayoutMode();
    if (mode === 'compact') return 20;
    return 24;
}

// Throttle interval => 8 commands/sec
const THROTTLE_MS = 125;

// Debounce utility to prevent excessive re-renders during resize
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

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
let websocketAudio;
let websocketData;
let websocketRds;
let rdsBoxAdvanced = null;
let argDebug = argv.debug;
let argAutoPlay = argv['auto-play'];
let argUrl;
let pingTime = null;
let lastRdsData = null;
let lastRdsUpdate = 0;
let RDS_UPDATE_INTERVAL = 500;
let audioPlaying = false;
let rdsWorker = null;
let rdsDataCache = null;
let audioWorker = null;

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
if (argv.help) {
    console.log('Usage: node fm-dx-console.js --url <fm-dx> [--debug] [--auto-play]');
    process.exit(0);
}

if (!argv.url) {
    console.error('Usage: node fm-dx-console.js --url <fm-dx> [--debug] [--auto-play]');
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
    websocketRds = `${websocketAddress}/rds`;
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

/** Render the screen and keep the cursor hidden */
function renderScreen() {
    screen.render();
    screen.program.hideCursor();
}

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
    const minCols = getMinCols();
    const minRows = getMinRows();
    if (cols < minCols || rows < minRows) {
        uiBox.hide();
        warningBox.setContent(
            `\n   Terminal too small!\n\n` +
            `   Please resize to at least ${minCols}x${minRows}\n`
        );
        warningBox.show();
    } else {
        warningBox.hide();
        uiBox.show();
    }
    renderScreen();
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
        "'y'  cycle antenna",
        "'s'  server info",
    ];

    const rightCommands = [
        "'→'  increase 0.1 MHz",
        "'↑'  increase 0.01 MHz",
        "'x'  increase 1 MHz",
        "'t'  set frequency",
        "'C'  send command",
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

/** Strip non-ASCII characters from a string */
function stripUnicode(str) {
    return (str || '').replace(/[^\x00-\x7F]/g, '');
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
    const now = new Date();
    const clockStr = now.toLocaleTimeString([], { hour12: false }) + ' ';

    const totalWidth = screen.cols;
    const minWidth = Math.max(leftText.length + clockStr.length + 1, MIN_COLS);
    
    let spacing;
    if (totalWidth < minWidth) {
        // Terminal too narrow - use minimal spacing
        spacing = 1;
    } else {
        spacing = totalWidth - (leftText.length + clockStr.length);
        if (spacing < 1) spacing = 1;
    }

    // Truncate left text if necessary to prevent overflow
    let displayLeftText = leftText;
    const maxLeftWidth = Math.floor(totalWidth * 0.6);
    if (displayLeftText.length > maxLeftWidth) {
        displayLeftText = displayLeftText.substring(0, maxLeftWidth - 3) + '... ';
    }

    titleBar.setContent(displayLeftText + ' '.repeat(spacing) + clockStr);
}

// Tuner, RDS, Station sections
// Layout widths for 80x25 terminals
// Shrink the tuner and station boxes a little so RDS
// has enough room for ECC and AF data
// Place Tuner and RDS next to each other so everything fits in 80x25
// widen tuner and RDS boxes so their content fits properly
// These widths will be scaled proportionally when the terminal resizes
let tunerWidth = 22;
let rdsWidth = 30;
const TUNER_RATIO = tunerWidth / 80;  // ratios based on original 80 column layout
const RDS_RATIO = rdsWidth / 80;

function getLayoutMode() {
    const rows = screen.rows;
    if (rows < 28) return 'compact';
    if (rows > 45) return 'expanded';
    return 'normal';
}

// Calculate box heights based on terminal size
function getTopBoxHeight() {
    const rows = screen.rows;
    const mode = getLayoutMode();
    
    let ratio;
    switch (mode) {
        case 'compact':
            ratio = 0.32;
            break;
        case 'expanded':
            ratio = 0.38;
            break;
        default:
            ratio = 0.35;
    }
    
    // Clamp between min and max based on mode
    const minHeight = mode === 'compact' ? 5 : 6;
    const maxHeight = mode === 'expanded' ? 12 : 10;
    
    return Math.min(maxHeight, Math.max(minHeight, Math.floor(rows * ratio)));
}

function getRdsBoxHeight() {
    return getTopBoxHeight() + 2;
}

function getRowHeight() {
    return Math.max(getTopBoxHeight(), getRdsBoxHeight());
}

function getRtBoxHeight() {
    const mode = getLayoutMode();
    const rows = screen.rows;
    if (mode === 'compact') return 2;
    if (mode === 'expanded') return 5;
    return 3;
}

function getBottomBoxHeight() {
    const rows = screen.rows;
    const mode = getLayoutMode();
    const rowHeight = getRowHeight();
    const rtHeight = getRtBoxHeight();
    const remaining = rows - rowHeight - rtHeight - 3;
    
    if (mode === 'compact') return Math.max(3, Math.floor(remaining * 0.5));
    return Math.max(4, Math.floor(remaining * 0.55));
}

let heightInRows = getTopBoxHeight();
let rdsHeight = getRdsBoxHeight();
let rowHeight = getRowHeight();

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
    width: screen.cols - (tunerWidth + rdsWidth),
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

// Advanced RDS Window (toggle with 'a' key)
rdsBoxAdvanced = blessed.box({
    parent: uiBox,
    top: 'center',
    left: 'center',
    width: '90%',
    height: '90%',
    tags: true,
    border: { type: 'line' },
    style: boxStyle,
    label: boxLabel('Advanced RDS'),
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
renderScreen();

// Update the title bar every second (for the clock)
setInterval(() => {
    updateTitleBar();
    renderScreen();
}, 1000);

/**
 * Adjust the progress bar width after a resize
 */
function updateProgressBarWidth() {
    progressBar.width = signalBox.width - 5;
}

/**
 * Adjust tuner, RDS, and station box widths and heights based on screen size
 */
function applyLayout() {
    const total = screen.cols;
    const mode = getLayoutMode();
    
    const minTuner = mode === 'compact' ? 14 : 16;
    const minRds = mode === 'compact' ? 20 : 24;
    
    tunerWidth = Math.max(minTuner, Math.floor(total * TUNER_RATIO));
    rdsWidth = Math.max(minRds, Math.floor(total * RDS_RATIO));
    const stationWidth = Math.max(15, total - tunerWidth - rdsWidth);

    // Recalculate heights based on current terminal size
    heightInRows = getTopBoxHeight();
    rdsHeight = getRdsBoxHeight();
    rowHeight = getRowHeight();
    const rtHeight = getRtBoxHeight();
    const bottomBoxHeight = getBottomBoxHeight();

    tunerBox.width = tunerWidth;
    tunerBox.height = heightInRows;
    rdsBox.left = tunerWidth;
    rdsBox.width = rdsWidth;
    rdsBox.height = rdsHeight;
    stationBox.left = tunerWidth + rdsWidth;
    stationBox.width = stationWidth;
    stationBox.height = heightInRows;

    // Update RT box position and height
    rtBox.top = rowHeight;
    rtBox.height = rtHeight;

    // Update signal/stats boxes
    const boxTop = rowHeight + rtHeight + 1;
    signalBox.top = boxTop;
    signalBox.height = bottomBoxHeight;
    statsBox.top = boxTop;
    statsBox.height = bottomBoxHeight;
}

/**
 * On terminal resize, we re-check if UI is too small,
 * recalc the bottom bar, recalc the title bar, etc.
 */
const handleResize = debounce(() => {
    // Batch all layout changes first
    updateProgressBarWidth();
    applyLayout();
    checkSizeAndToggleUI();
    
    // Only update UI content if there's data
    if (jsonData) {
        updateTunerBox(jsonData);
        updateRdsBox(jsonData);
        updateStationBox(jsonData.txInfo);
    }
    
    // Update bars
    bottomBox.setContent(genBottomText(argUrl));
    updateTitleBar();
    
    // Single render at the end
    renderScreen();
}, 75);

screen.on('resize', handleResize);

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
        `${padStringWithSpaces("ANT:", 'green', padLength)}${getAntLabel(data.ant)}\n`
    );
}

function updateRdsBox(data) {
    if (!rdsBox || !data) return;
    // Use a slightly wider prefix column so all values line up
    const padLength = 9;
    const hasValidRds = data.freq >= 75 && data.pi !== "?";
    const useData = hasValidRds ? data : lastRdsData && lastRdsData.pi !== "?" ? lastRdsData : null;
    if (useData) {
        if (hasValidRds) lastRdsData = data;
        let msshow;
        if (useData.ms === 0) {
            msshow = '{grey-fg}M{/grey-fg}S';
        } else if (useData.ms === -1) {
            msshow = '{grey-fg}M{/grey-fg}{grey-fg}S{/grey-fg}';
        } else {
            msshow = 'M{grey-fg}S{/grey-fg}';
        }

        const psDisplay = processStringWithErrors(useData.ps.trimStart(), useData.ps_errors);
        const prefix = (txt) => padStringWithSpaces(txt, 'green', padLength);
        const lines = [];

        lines.push(`${prefix('PS:')}${psDisplay}`);
        lines.push(`${prefix('PI:')}${useData.pi}`);
        lines.push(`${prefix('ECC:')}${useData.ecc || ''}`);
        const countryIso = useData.country_iso;
        const countryName = useData.country_name;
        const countryValue =
            countryName || (countryIso && countryIso !== 'UN' ? countryIso : '');
        lines.push(`${prefix('Country:')}${countryValue}`);
        lines.push(
            `${prefix('Flags:')}` +
            `${useData.tp ? 'TP' : '{grey-fg}TP{/grey-fg}'} ` +
            `${useData.ta ? 'TA' : '{grey-fg}TA{/grey-fg}'} ` +
            `${msshow}`
        );
        const ptyNum = useData.pty !== undefined ? useData.pty : 0;
        lines.push(`${prefix('PTY:')}${ptyNum}`);
        const fullPtyText = europe_programmes[ptyNum] || 'None';
        const maxPtyLen = rdsBox.width - 2 - (padLength + 1);
        const truncatedPty =
            fullPtyText.length > maxPtyLen
                ? fullPtyText.slice(0, maxPtyLen - 1) + '…'
                : fullPtyText;
        lines.push(`${prefix('PTY txt:')}${truncatedPty}`);
        if (useData.dynamic_pty !== undefined || useData.artificial_head !== undefined || useData.compressed !== undefined) {
            lines.push(`${prefix('DI:')}DP:${useData.dynamic_pty ? 'On' : 'Off'} AH:${useData.artificial_head ? 'On' : 'Off'} C:${useData.compressed ? 'On' : 'Off'} Stereo:${useData.st ? 'Yes' : 'No'}`);
        }
        if (Array.isArray(useData.af) && useData.af.length) {
            lines.push(`${prefix('AF:')}Yes`);
        } else {
            lines.push(`${prefix('AF:')}None`);
        }

        rdsBox.setContent(lines.join('\n'));
        renderScreen();
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

function resetRds() {
    lastRdsData = null;
    updateRdsBox({});
    updateRTBox({});
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
    const padLength = 16;
    const mode = getLayoutMode();
    
    let content = '';
    
    // Show server info when terminal is large enough (normal or expanded mode)
    if (mode !== 'compact' && tunerName) {
        content += `${padStringWithSpaces('Server:', 'green', padLength)}${stripUnicode(tunerName)}\n`;
        if (mode === 'expanded' && tunerDesc) {
            content += `${padStringWithSpaces('Desc:', 'green', padLength)}${stripUnicode(tunerDesc)}\n`;
        }
        content += '\n';
    }
    
    content += 
        `${padStringWithSpaces('Server users:', 'green', padLength)}${data.users}\n` +
        `${padStringWithSpaces('Server ping:', 'green', padLength)}${pingTime !== null ? pingTime + ' ms' : ''}\n` +
        `${padStringWithSpaces('Local audio:', 'green', padLength)}${audioPlaying ? 'Playing' : 'Stopped'}`;
    
    statsBox.setContent(content);
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
    const name = stripUnicode(tunerName);
    const desc = stripUnicode(tunerDesc);
    const content = [` ${name}`];
    if (desc) {
        content.push('', desc);
    }
    serverBox.setContent(content.join('\n'));
}

function updateRdsAdvancedBox() {
    if (!rdsBoxAdvanced || rdsBoxAdvanced.hidden) return;
    if (!rdsDataCache) return;
    const d = rdsDataCache;
    const stableFlags = d.stableFlags;
    const lines = [];
    const pad = 12;
    const lbl = (text) => padStringWithSpaces(text, 'green', pad);

    // Header
    lines.push(`${lbl('PI:')}${d.pi}   ${lbl('PTY:')}${d.ptyName} [${d.pty}]`);

    // Flags
    const tpDisplay = stableFlags.tpStable ? (d.tp ? '1' : '0') : '-';
    const taDisplay = stableFlags.taStable ? (d.ta ? '1' : '0') : '-';
    const msDisplay = stableFlags.msStable ? (d.ms ? 'Music' : 'Speech') : '-';
    const stereoDisplay = stableFlags.diStereoStable ? (d.diStereo ? '1' : '0') : '-';
    lines.push(`${lbl('TP/TA:')}${tpDisplay}/${taDisplay}   ${lbl('MS:')}${msDisplay}   ${lbl('Stereo:')}${stereoDisplay}`);

    const diStereo = stableFlags.diStereoStable ? d.diStereo : null;
    const diAh = stableFlags.diAhStable ? d.diArtificialHead : null;
    const diComp = stableFlags.diCompStable ? d.diCompressed : null;
    const diDpty = stableFlags.diDptyStable ? d.diDynamicPty : null;
    lines.push(`${lbl('DI:')}Stereo=${diStereo !== null ? (diStereo ? 1:0) : '-'} AH=${diAh !== null ? (diAh ? 1:0) : '-'} Comp=${diComp !== null ? (diComp ? 1:0) : '-'} DPTY=${diDpty !== null ? (diDpty ? 1:0) : '-'}`);

    lines.push('');
    // Text fields
    const psMark = d.psStable ? '*' : '';
    lines.push(`${lbl('PS' + psMark)}${d.ps || '(waiting...)'}`);
    if (d.longPs && d.longPs.length > 0) {
        lines.push(`${lbl('Long PS')}${d.longPs}`);
    }
    if (d.ptyn && d.ptyn.length > 0) {
        lines.push(`${lbl('PTYN')}${d.ptyn}`);
    }
    if (d.rtA || d.rtB) {
        if (d.rtA) lines.push(`${lbl('RT-A')}${d.rtA}`);
        if (d.rtB) lines.push(`${lbl('RT-B')}${d.rtB}`);
    } else if (d.rt) {
        const stableMark = d.rtStable ? '*' : '';
        lines.push(`${lbl(`RT ${d.rtAbFlag ? '(B)' : '(A)'}${stableMark}`)}${d.rt}`);
    }

    lines.push('');
    // AF / IDs / Time / BER
    if (d.afList && d.afList.length > 0) {
        lines.push(`${lbl(`AF (${d.afType})`)}${d.afList.join(', ')}`);
    }
    if (d.ecc || d.lic) {
        lines.push(`${lbl('ECC / LIC')}${(d.ecc || '-') + ' / ' + (d.lic || '-')}`);
    }
    if (d.pin) {
        lines.push(`${lbl('PIN')}${d.pin}`);
    }
    if (d.localTime || d.utcTime) {
        lines.push(`${lbl('Time')}${d.localTime || '-'}  UTC: ${d.utcTime || '-'}`);
    }
    if (d.ber >= 0) {
        lines.push(`${lbl('BER')}${d.ber.toFixed(2)}%`);
    }

    // Features
    const features = [];
    if (d.hasRtPlus) features.push('RDS+');
    if (d.hasTmc) features.push('TMC');
    if (d.hasEon) features.push('EON');
    if (d.odaList.length > 0) features.push('ODA');
    if (features.length > 0) {
        lines.push('');
        lines.push(`${lbl('Features')}${features.join(', ')}`);
    }
    if (d.odaList.length > 0) {
        lines.push(`${lbl('ODA')}${d.odaList.map(o => o.aid).join(', ')}`);
    }

    // Groups
    lines.push('');
    const stats = d.groupStats;
    const fmtStat = (s) => `${s.group}:${s.percent}%`;
    const rows = [];
    const maxStats = Math.min(stats.length, 16);
    for (let i = 0; i < maxStats; i += 3) {
        rows.push(stats.slice(i, i + 3).map(fmtStat).join('   '));
    }
    if (rows.length > 0) {
        lines.push(`${lbl('Groups')}${rows[0]}`);
        for (let i = 1; i < rows.length; i++) {
            lines.push(`${padStringWithSpaces('', 'green', pad)}${rows[i]}`);
        }
    }

    // EON
    const eonData = d.eonData;
    if (Object.keys(eonData).length > 0) {
        lines.push('');
        lines.push('{bold}EON{/bold}');
        for (const [pi, net] of Object.entries(eonData)) {
            let eonLine = `${lbl(pi)}${net.ps || '-'}  TP=${net.tp?1:0} TA=${net.ta?1:0}`;
            if (net.af && net.af.length > 0) eonLine += ` AF=[${net.af.join(',')}]`;
            if (net.mappedFreqs && net.mappedFreqs.length > 0) eonLine += ` Map=[${net.mappedFreqs.join(',')}]`;
            if (net.linkageInfo) eonLine += ` Link=${net.linkageInfo}`;
            if (net.pin) eonLine += ` PIN=${net.pin}`;
            lines.push(eonLine);
        }
    }

    rdsBoxAdvanced.setContent(lines.join('\n'));
}

// -----------------------------
// Audio (worker)
// -----------------------------
function initAudioWorker() {
    if (audioWorker) return;
    audioWorker = new Worker('./audio-worker.js', {
        workerData: { url: websocketAudio, userAgent: userAgent }
    });
    audioWorker.on('error', (err) => debugLog('Audio worker error: ' + err.message));
    audioWorker.on('exit', (code) => debugLog('Audio worker exit: ' + code));
}

function startAudio() {
    if (!audioWorker) initAudioWorker();
    audioWorker.postMessage({ type: 'start' });
    audioPlaying = true;
}

function stopAudio() {
    if (audioWorker) audioWorker.postMessage({ type: 'stop' });
    audioPlaying = false;
}

// -----------------------------
// Tuner Info + Ping
// -----------------------------
async function tunerInfo() {
    try {
        const result = await getTunerInfo(argUrl);
        tunerName = result.tunerName || '';
        tunerDesc = result.tunerDesc || '';
        setAntNames(result.antNames || []);
        if (result.activeAnt !== undefined) {
            if (!jsonData) jsonData = {};
            jsonData.ant = result.activeAnt;
        }

        updateServerBox();
        renderScreen();
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
            renderScreen();
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
    if (argAutoPlay) {
        startAudio();
        audioPlaying = true;
        updateStatsBox(jsonData || {});
        renderScreen();
    }
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

            renderScreen();
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
// Advanced RDS WebSocket (Worker Thread)
// -----------------------------

function initRdsWorker() {
    rdsWorker = new Worker('./rds-worker.js');
    
    rdsWorker.on('message', (msg) => {
        if (msg.type === 'data') {
            rdsDataCache = msg;
            
            const now = Date.now();
            if (now - lastRdsUpdate > RDS_UPDATE_INTERVAL) {
                lastRdsUpdate = now;
                updateRdsAdvancedBox();
                renderScreen();
            }
        }
    });
    
    rdsWorker.on('error', (err) => {
        debugLog('RDS Worker error:', err.message);
    });
    
    rdsWorker.on('exit', (code) => {
        debugLog('RDS Worker exited with code:', code);
    });
}

function requestRdsData() {
    if (rdsWorker) {
        rdsWorker.postMessage({ type: 'getData' });
    }
}

function connectRdsWebSocket() {
    if (!websocketRds) return;
    
    initRdsWorker();
    
    const rdsWsOptions = userAgent ? { headers: { 'User-Agent': `${userAgent} (rds)` } } : {};
    const rdsWs = new WebSocket(websocketRds, rdsWsOptions);
    
    rdsWs.on('open', () => {
        debugLog('RDS WebSocket connection established');
    });
    
    RDS_UPDATE_INTERVAL = 500;
    let rdsMsgBuffer = [];
    let rdsProcessInterval = null;
    
    function processRdsBuffer() {
        if (rdsMsgBuffer.length === 0) return;
        
        const msgs = rdsMsgBuffer.splice(0, rdsMsgBuffer.length);
        for (const msg of msgs) {
            if (rdsWorker) {
                rdsWorker.postMessage({ type: 'parse', data: msg });
            }
        }
    }
    
    rdsWs.on('message', (data) => {
        try {
            const msg = data.toString();
            rdsMsgBuffer.push(msg);
            
            if (!rdsProcessInterval) {
                rdsProcessInterval = setInterval(processRdsBuffer, 200);
            }
        } catch (error) {
            debugLog('Error parsing RDS data:', error);
        }
    });
    
    setInterval(requestRdsData, 500);
    
    rdsWs.on('error', (err) => {
        debugLog('RDS WebSocket error:', err.message);
    });
    
    rdsWs.on('close', () => {
        debugLog('RDS WebSocket connection closed');
        if (rdsProcessInterval) {
            clearInterval(rdsProcessInterval);
            rdsProcessInterval = null;
        }
        if (rdsWorker) {
            rdsWorker.terminate();
            rdsWorker = null;
        }
    });
}

connectRdsWebSocket();

// -----------------------------
// Key Bindings
// -----------------------------
screen.on('keypress', async (ch, key) => {
    if (key.full === 'left') {
        if (jsonData && jsonData.freq) {
            enqueueCommand(`T${(jsonData.freq * 1000) - 100}`);
            resetRds();
        }
    } else if (key.full === 'right') {
        if (jsonData && jsonData.freq) {
            enqueueCommand(`T${(jsonData.freq * 1000) + 100}`);
            resetRds();
        }
    } else if (key.full === 'up') {
        if (jsonData && jsonData.freq) {
            enqueueCommand(`T${(jsonData.freq * 1000) + 10}`);
            resetRds();
        }
    } else if (key.full === 'down') {
        if (jsonData && jsonData.freq) {
            enqueueCommand(`T${(jsonData.freq * 1000) - 10}`);
            resetRds();
        }
    } else if (key.full === 'x') {
        if (jsonData && jsonData.freq) {
            enqueueCommand(`T${(jsonData.freq * 1000) + 1000}`);
            resetRds();
        }
    } else if (key.full === 'z') {
        if (jsonData && jsonData.freq) {
            enqueueCommand(`T${(jsonData.freq * 1000) - 1000}`);
            resetRds();
        }
    } else if (key.full.toLowerCase() === 'r') {
        if (jsonData && jsonData.freq) {
            enqueueCommand(`T${(jsonData.freq * 1000)}`);
            resetRds();
        }
    } else if (key.full.toLowerCase() === 'a') {
        // Toggle advanced RDS window
        rdsBoxAdvanced.hidden = !rdsBoxAdvanced.hidden;
        if (!rdsBoxAdvanced.hidden) {
            updateRdsAdvancedBox();
        } else {
            rdsBoxAdvanced.setContent('');
            screen.realloc();
        }
        renderScreen();
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
                    resetRds();
                } else {
                    debugLog('Invalid frequency input.');
                }
            }
            dialog.destroy();
            screen.restoreFocus();
            renderScreen();
        });
    } else if (key.full === 'C') {
        // Direct command input
        screen.saveFocus();
        const dialog = blessed.prompt({
            parent: uiBox,
            top: 'center',
            left: 'center',
            width: 30,
            height: 8,
            border: 'line',
            style: boxStyle,
            label: boxLabel('Send Command'),
            tags: true
        });
        dialog.input('\n  Enter command', '', (err, value) => {
            if (!err && value) {
                enqueueCommand(value.trim());
            }
            dialog.destroy();
            screen.restoreFocus();
            renderScreen();
        });
    } else if (key.full === 'h') {
        // Toggle the help box
        helpBox.hidden = !helpBox.hidden;
        renderScreen();
    } else if (key.full === 'p') {
        // Toggle audio
        if (audioPlaying) {
            stopAudio();
            audioPlaying = false;
        } else {
            startAudio();
            audioPlaying = true;
        }
        if (jsonData) {
            updateStatsBox(jsonData);
            renderScreen();
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
        // Toggle antennas in a 0-based cycle.
        // Update jsonData locally so rapid toggling works before the server responds.
        if (jsonData && jsonData.ant !== undefined) {
            const current = parseInt(jsonData.ant, 10) || 0;
            const count = Math.max(getAntNames().length, 1);
            const newAnt = count > 0 ? (current + 1) % count : 0;
            enqueueCommand(`Z${newAnt}`);
            jsonData.ant = newAnt;
            updateTunerBox(jsonData);
            renderScreen();
        }
    } else if (key.full.toLowerCase() === 's') {
        // Toggle server info popup
        serverBox.hidden = !serverBox.hidden;
        if (!serverBox.hidden) {
            await tunerInfo();
            updateServerBox();
        } else {
            serverBox.setContent('');
            screen.realloc();
        }
        renderScreen();
    } else if (key.full.toLowerCase() === 'r') {
        // Toggle advanced RDS window
        rdsBoxAdvanced.hidden = !rdsBoxAdvanced.hidden;
        if (!rdsBoxAdvanced.hidden) {
            updateRdsAdvancedBox();
        } else {
            rdsBoxAdvanced.setContent('');
            screen.realloc();
        }
        renderScreen();
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
applyLayout();
updateProgressBarWidth();
updateTitleBar();     // Initial top bar update
updateServerBox();    // Fill server info if tuner info is already loaded
