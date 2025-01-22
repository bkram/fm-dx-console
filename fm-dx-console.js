#!/usr/bin/env node
//
// (c) Bkram 2024
// Console client for https://github.com/NoobishSVK/fm-dx-webserver

// -----------------------------
// Imports
// -----------------------------
const argv = require('minimist')(process.argv.slice(2), {
    string: ['url'],
    boolean: ['debug']
});
const blessed = require('blessed'); // Ensure you're using 'blessed'
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
const version = '1.50';
const userAgent = `fm-dx-console/${version}`;
const titleStyle = { fg: 'black', bg: 'green', bold: true };
const boxStyle = { border: { fg: 'green', bg: 'blue' }, bg: 'blue' };

// -----------------------------
// Global Variables
// -----------------------------
let jsonData = null;
let previousJsonData = null;
let tunerDesc;
let tunerName;
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

// Function to log debug messages
function debugLog(...args) {
    if (argDebug) {
        const message = args.join(' ');
        logStream.write(message + '\n');
    }
}

// -----------------------------
// Argument Parsing and Validation
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
// UI Setup
// -----------------------------
const screen = blessed.screen({
    smartCSR: true,
    mouse: true,
    fullUnicode: false,
    dockBorders: true,
    style: {
        bg: 'blue'
    }
});

function genBottomText(variableString) {
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
        helpString +
        ' '
    );
}

// Help content
function generateHelpContent() {
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

function padStringWithSpaces(text, color = 'green', totalLength) {
    const tagRegex = /\{(.*?)\}/g;
    const strippedText = text.replace(tagRegex, '');
    const spacesToAdd = totalLength - strippedText.length;
    if (spacesToAdd <= 0) return text;
    return ' ' + `{${color}-fg}` + text + `{/${color}-fg}` + ' '.repeat(spacesToAdd);
}

function boxLabel(label) {
    return `{white-fg}{blue-bg}{bold}${label}{/bold}{/blue-bg}{/white-fg}`;
}

function checkTerminalSize() {
    const { cols, rows } = screen;
    if (cols < 80 || rows < 24) {
        console.error('Terminal size must be at least 80x24. Please resize your terminal.');
        process.exit(1);
    }
}
checkTerminalSize();

// Parent box
const parentBox = blessed.box({
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    tags: true,
    style: { bg: 'blue' },
});
screen.append(parentBox);

const title = blessed.box({
    parent: parentBox,
    top: 0,
    left: 0,
    width: '100%',
    height: 1,
    content: ` fm-dx-console ${version} by Bkram `,
    tags: true,
    style: titleStyle,
    align: 'center',
});

const clockText = blessed.text({
    parent: parentBox,
    top: 0,
    right: 2,
    width: 10,
    content: '',
    tags: true,
    style: titleStyle,
    align: 'right',
});

const serverBox = blessed.box({
    parent: parentBox,
    top: 1,
    left: 0,
    width: '100%',
    height: 5,
    tags: true,
    border: { type: 'line' },
    style: boxStyle,
    label: boxLabel('Connected to:'),
});

// Tuner, RDS, Station Info
const tunerWidth = 24;
const rdsWidth = 17;
const heightInRows = 8;

const tunerBox = blessed.box({
    parent: parentBox,
    top: 6,
    left: 0,
    width: tunerWidth,
    height: heightInRows,
    tags: true,
    border: { type: 'line' },
    style: boxStyle,
    label: boxLabel('Tuner'),
});

const rdsBox = blessed.box({
    parent: parentBox,
    top: 6,
    left: tunerWidth,
    width: rdsWidth,
    height: heightInRows,
    tags: true,
    border: { type: 'line' },
    style: boxStyle,
    label: boxLabel('RDS'),
});

const stationBox = blessed.box({
    parent: parentBox,
    top: 6,
    left: tunerWidth + rdsWidth,
    width: `100%-${tunerWidth + rdsWidth}`,
    height: heightInRows,
    tags: true,
    border: { type: 'line' },
    style: boxStyle,
    label: boxLabel('Station Information'),
});

// RT Box
const rtBox = blessed.box({
    parent: parentBox,
    top: tunerBox.top + tunerBox.height,
    left: 0,
    width: '100%',
    height: 4,
    tags: true,
    border: { type: 'line' },
    style: boxStyle,
    label: boxLabel('RDS Radiotext'),
});

// Signal/Stats boxes
const boxHeight = 5;

const signalBox = blessed.box({
    parent: parentBox,
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
        bar: {
            bg: 'red'
        }
    },
    filled: 0,
});

const statsBox = blessed.box({
    parent: parentBox,
    top: rtBox.top + rtBox.height,
    left: '50%',
    width: '50%',
    height: boxHeight,
    tags: true,
    border: { type: 'line' },
    style: boxStyle,
    label: boxLabel('Statistics'),
});

// Bottom bar
const bottomBox = blessed.box({
    parent: parentBox,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 1,
    tags: true,
    style: titleStyle,
    content: genBottomText(argUrl),
});

// Help box
const helpBox = blessed.box({
    parent: parentBox,
    top: 'center',
    left: 'center',
    width: 60,
    height: 18,
    border: { type: 'line' },
    style: boxStyle,
    label: boxLabel('Help'),
    content: generateHelpContent(),
    tags: true,
    hidden: true,
});

// Extra info box
let extraInfoBox = null;
function createExtraInfoBox() {
    if (!extraInfoBox) {
        extraInfoBox = blessed.box({
            parent: parentBox,
            top: rtBox.top + rtBox.height + boxHeight,
            left: 0,
            width: '100%',
            height: 3,
            tags: true,
            border: { type: 'line' },
            style: boxStyle,
            label: boxLabel('Additional Connection Info'),
            content: 'Connected to: ' + (tunerName || 'N/A'),
        });
    } else {
        extraInfoBox.show();
        extraInfoBox.setContent('Connected to: ' + (tunerName || 'N/A'));
    }
    screen.render();
}

function removeExtraInfoBox() {
    if (extraInfoBox) {
        extraInfoBox.hide();
        screen.render();
    }
}

function initializeExtraInfoBox() {
    const { rows } = screen;
    if (rows > 25) {
        createExtraInfoBox();
    } else {
        removeExtraInfoBox();
    }
}
initializeExtraInfoBox();
screen.render();

// Clock
function updateClock() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour12: false });
    clockText.setContent(timeStr);
}
setInterval(() => {
    updateClock();
    screen.render();
}, 1000);

// Resize
function updateProgressBarWidth() {
    progressBar.width = signalBox.width - 5;
}

screen.on('resize', () => {
    checkTerminalSize();

    parentBox.width = '100%';
    parentBox.height = '100%';

    title.width = '100%';
    title.left = 0;

    clockText.top = 0;
    clockText.right = 2;

    serverBox.width = '100%';
    serverBox.left = 0;

    bottomBox.width = '100%';
    bottomBox.left = 0;
    bottomBox.content = genBottomText(argUrl);

    stationBox.width = `100%-${tunerWidth + rdsWidth}`;

    rtBox.width = '100%';

    signalBox.width = '50%';
    statsBox.width = '50%';
    statsBox.left = '50%';

    updateProgressBarWidth();

    const helpBoxHeight = 18;
    const helpBoxWidth = 60;
    helpBox.top = Math.floor((screen.rows - helpBoxHeight) / 2);
    helpBox.left = Math.floor((screen.cols - helpBoxWidth) / 2);

    initializeExtraInfoBox();
    screen.render();
});

// UI updates
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

function updateServerBox() {
    if (tunerName && tunerDesc) {
        serverBox.setContent(tunerDesc);
        serverBox.setLabel(boxLabel(`Connected to: ${tunerName}`));
        bottomBox.setContent(genBottomText(argUrl));

        if (extraInfoBox && !extraInfoBox.hidden) {
            extraInfoBox.setContent('Connected to: ' + (tunerName || 'N/A'));
        }
    }
}

function updateRdsBox(data) {
    if (!rdsBox || !data) return;

    const padLength = 4;
    if (data.freq >= 75 && data.pi !== "?") {
        let msshow;
        if (data.ms === 0) {
            msshow = "{grey-fg}M{/grey-fg}S";
        } else if (data.ms === -1) {
            msshow = "{grey-fg}M{/grey-fg}{grey-fg}S{/grey-fg}";
        } else {
            msshow = "M{grey-fg}S{/grey-fg}";
        }

        rdsBox.setContent(
            `${padStringWithSpaces("PS:", 'green', padLength)}${data.ps.trimStart()}\n` +
            `${padStringWithSpaces("PI:", 'green', padLength)}${data.pi}\n` +
            `{center}{bold}Flags{/bold}\n` +
            `${data.tp ? "TP" : "{grey-fg}TP{/grey-fg}"} ` +
            `${data.ta ? "TA" : "{grey-fg}TA{/grey-fg}"} ` +
            `${msshow}\n` +
            `${data.pty ? europe_programmes[data.pty] : ""}{/center}`
        );
    } else {
        rdsBox.setContent('');
    }
}

function updateRTBox(data) {
    if (!rtBox || !data) return;
    rtBox.setContent(
        `{center}${data.rt0.trim()}{/center}\n` +
        `{center}${data.rt1.trim()}{/center}`
    );
}

function updateStationBox(txInfo) {
    if (!stationBox || !txInfo) return;
    const padLength = 10;
    if (txInfo.tx) {
        stationBox.setContent(
            `${padStringWithSpaces("Name:", 'green', padLength)}${txInfo.tx}\n` +
            `${padStringWithSpaces("Location:", 'green', padLength)}${txInfo.city + ", " + txInfo.itu}\n` +
            `${padStringWithSpaces("Distance:", 'green', padLength)}${txInfo.dist + " km"}\n` +
            `${padStringWithSpaces("Power:", 'green', padLength)}${txInfo.erp + " kW " + "[" + txInfo.pol + "]"}\n` +
            `${padStringWithSpaces("Azimuth:", 'green', padLength)}${txInfo.azi + "°"}`
        );
    } else {
        stationBox.setContent("");
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

// Signal meter
function scaleValue(value) {
    const maxvalue = 130; // Adjust if needed
    value = Math.max(0, Math.min(maxvalue, value));
    return Math.floor((value / maxvalue) * 100);
}

function updateSignal(signal) {
    if (!progressBar) return;
    progressBar.setProgress(scaleValue(signal));
}

// Audio
const player = playAudio(websocketAudio, userAgent, 2048, argv.debug);

// Tuner info + Ping
async function tunerInfo() {
    try {
        const result = await getTunerInfo(argUrl);
        tunerName = result.tunerName;
        tunerDesc = result.tunerDesc;
        antNames = result.antNames;
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

// -----------------------------
// Command Throttling
// -----------------------------
const commandQueue = [];

// Throttle interval in ms
const THROTTLE_MS = 100;

// This function enqueues commands instead of sending them immediately
function enqueueCommand(cmd) {
    commandQueue.push(cmd);
}

// Send up to one command every THROTTLE_MS
setInterval(() => {
    if (commandQueue.length > 0 && ws && ws.readyState === WebSocket.OPEN) {
        const nextCmd = commandQueue.shift();
        debugLog(`Sending command: ${nextCmd}`);
        ws.send(nextCmd);
    }
}, THROTTLE_MS);

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

            if (extraInfoBox && !extraInfoBox.hidden) {
                extraInfoBox.setContent('Connected to: ' + (tunerName || 'N/A'));
            }

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
//
// Replaced direct ws.send(...) with enqueueCommand(...),
// so we don't exceed the 4 commands/sec limit.

screen.on('keypress', (ch, key) => {
    if (key.full === 'right') {
        // Increase freq by 100 kHz
        if (jsonData && jsonData.freq) {
            enqueueCommand(`T${(jsonData.freq * 1000) + 100}`);
        }
    } else if (key.full === 'left') {
        // Decrease freq by 100 kHz
        if (jsonData && jsonData.freq) {
            enqueueCommand(`T${(jsonData.freq * 1000) - 100}`);
        }
    } else if (key.full === 'up') {
        // Increase freq by 10 kHz
        if (jsonData && jsonData.freq) {
            enqueueCommand(`T${(jsonData.freq * 1000) + 10}`);
        }
    } else if (key.full === 'down') {
        // Decrease freq by 10 kHz
        if (jsonData && jsonData.freq) {
            enqueueCommand(`T${(jsonData.freq * 1000) - 10}`);
        }
    } else if (key.full === 'x') {
        // Increase freq by 1 MHz
        if (jsonData && jsonData.freq) {
            enqueueCommand(`T${(jsonData.freq * 1000) + 1000}`);
        }
    } else if (key.full === 'z') {
        // Decrease freq by 1 MHz
        if (jsonData && jsonData.freq) {
            enqueueCommand(`T${(jsonData.freq * 1000) - 1000}`);
        }
    } else if (key.full === 'r') {
        // Refresh freq
        if (jsonData && jsonData.freq) {
            enqueueCommand(`T${(jsonData.freq * 1000)}`);
        }
    } else if (key.full === 't') {
        // Direct frequency input
        screen.saveFocus();
        const dialog = blessed.prompt({
            parent: parentBox,
            top: 'center',
            left: 'center',
            width: 30,
            height: 8,
            border: 'line',
            style: boxStyle,
            label: boxLabel('Direct Tuning'),
            tags: true,
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
        // Toggle help box
        if (helpBox.hidden) {
            helpBox.show();
        } else {
            helpBox.hide();
        }
        screen.render();
    } else if (key.full === 'p') {
        // Toggle audio playback
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
        if (jsonData.ims == 1) {
            enqueueCommand(`G${jsonData.eq}0`);
        } else {
            enqueueCommand(`G${jsonData.eq}1`);
        }
    } else if (key.full === ']') {
        // Toggle EQ
        if (jsonData.eq == 1) {
            enqueueCommand(`G0${jsonData.ims}`);
        } else {
            enqueueCommand(`G1${jsonData.ims}`);
        }
    } else if (key.full === 'y') {
        // Toggle antenna
        let newAnt = parseInt(jsonData.ant) + 1;
        if (newAnt >= antNames.length) {
            newAnt = 0;
        }
        enqueueCommand(`Z${newAnt}`);
    } else {
        debugLog(key.full);
    }
});

// Quit on Escape, C-c
screen.key(['escape', 'C-c'], () => {
    process.exit(0);
});
