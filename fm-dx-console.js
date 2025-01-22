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
const version = '1.41';
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

// Function to check for valid URL
function isValidURL(urlString) {
    try {
        new URL(urlString);
        return true;
    } catch (err) {
        return false;
    }
}

// Function to format a WebSocket URL
function formatWebSocketURL(url) {
    // Remove trailing slash if it exists
    if (url.endsWith('/')) {
        url = url.slice(0, -1);
    }
    // Replace http:// with ws:// and https:// with wss://
    if (url.startsWith("http://")) {
        url = url.replace("http://", "ws://");
    } else if (url.startsWith("https://")) {
        url = url.replace("https://", "wss://");
    }
    return url;
}

if (isValidURL(argUrl)) {
    // URL is valid, proceed with processing
    let websocketAddress = formatWebSocketURL(argUrl);
    websocketAudio = `${websocketAddress}/audio`;
    websocketData = `${websocketAddress}/text`;
} else {
    console.error("Invalid URL provided.");
    process.exit(1);
}

// Function to convert number to frequency
function convertToFrequency(num) {
    if (num === null || num === undefined || isNaN(Number(num.toString().replace(',', '.')))) {
        return null;
    }
    num = parseFloat(num.toString().replace(',', '.'));
    while (num >= 100) num /= 10;
    if (num < 76) num *= 10;
    return Math.round(num * 10) / 10;
}

// -----------------------------
// UI Setup
// -----------------------------

// Create a Blessed screen
const screen = blessed.screen({
    smartCSR: true,
    mouse: true,
    fullUnicode: false,
    dockBorders: true,
    style: {
        bg: 'blue'
    }
});

// Function to generate bottom text
function genBottomText(variableString) {
    const helpString = "Press `h` for help";
    const totalWidth = screen.cols - 2;
    const maxVariableLength = totalWidth - (helpString.length + 1);
    const truncatedVariableString = variableString.length > maxVariableLength
        ? variableString.substring(0, maxVariableLength)
        : variableString;
    const paddingLength = totalWidth - truncatedVariableString.length - helpString.length;
    return ' ' + truncatedVariableString + ' '.repeat(paddingLength) + helpString + ' ';
}

// Function to generate the help content
function generateHelpContent() {
    const leftCommands = [
        "'1' decrease .001 MHz",
        "'q' decrease .01 MHz",
        "'a' decrease .1 MHz",
        "'z' decrease 1 MHz",
        "'r' refresh",
        "'p' play audio",
        "'[' toggle iMS",
        "'y' toggle antenna",
    ];

    const rightCommands = [
        "'2' increase .001 MHz",
        "'w' increase .01 MHz",
        "'s' increase .1 MHz",
        "'x' increase 1 MHz",
        "'t' set frequency",
        "']' toggle EQ",
        "'Esc' quit",
        "'h' toggle help",
    ];

    let helpContent = '  Press key to:\n\n';
    for (let i = 0; i < leftCommands.length; i++) {
        const leftCmd = leftCommands[i];
        const rightCmd = rightCommands[i] || '';
        const leftPadded = leftCmd.padEnd(28);
        helpContent += `  ${leftPadded}${rightCmd}\n`;
    }
    return helpContent;
}

// Function to pad strings with spaces and color
function padStringWithSpaces(text, color = 'green', totalLength) {
    const tagRegex = /\{(.*?)\}/g;
    const strippedText = text.replace(tagRegex, '');
    const spacesToAdd = totalLength - strippedText.length;
    if (spacesToAdd <= 0) return text;
    return ' ' + `{${color}-fg}` + text + `{/${color}-fg}` + ' '.repeat(spacesToAdd);
}

// Function to create box labels with styling
function boxLabel(label) {
    return `{white-fg}{blue-bg}{bold}${label}{/bold}{/blue-bg}{/white-fg}`;
}

// Function to check terminal dimensions
function checkTerminalSize() {
    const { cols, rows } = screen;
    if (cols < 80 || rows < 24) {
        console.error('Terminal size must be at least 80x24. Please resize your terminal.');
        process.exit(1);
    }
}

// Create a parent box to fill the terminal and append to screen
const parentBox = blessed.box({
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    tags: true,
    style: { bg: 'blue' },
});
screen.append(parentBox);

// Now, create child elements with `parent: parentBox`
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

// Create other boxes (tunerBox, rdsBox, etc.) with fixed sizes
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
    width: `100%-${tunerWidth + rdsWidth}`, // Using string expression
    height: heightInRows,
    tags: true,
    border: { type: 'line' },
    style: boxStyle,
    label: boxLabel('Station Information'),
});

// Create a box for RT0 and RT1
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

// Create signalBox and statsBox
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

// Create a bottom title `bar`
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

// Create a help box
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

// Create an extra "Additional Connection Info" box (conditionally displayed)
let extraInfoBox = null;

// Function to create the extraInfoBox
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

// Function to remove/hide the extraInfoBox
function removeExtraInfoBox() {
    if (extraInfoBox) {
        extraInfoBox.hide();
        screen.render();
    }
}

// Function to initialize the extraInfoBox based on terminal size
function initializeExtraInfoBox() {
    const { rows } = screen;
    if (rows > 25) {
        createExtraInfoBox();
    } else {
        removeExtraInfoBox();
    }
}

// Initial check for terminal size and create/hide extraInfoBox accordingly
initializeExtraInfoBox();

// Initial render
screen.render();

// -----------------------------
// Function Definitions
// -----------------------------

// Function to update the clock content
function updateClock() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour12: false });
    clockText.setContent(timeStr);
}

// Update the clock content every second
setInterval(() => {
    updateClock();
    screen.render();
}, 1000);

// Function to update the progress bar width
function updateProgressBarWidth() {
    progressBar.width = signalBox.width - 5;
}

// Handle terminal resize events
screen.on('resize', () => {
    checkTerminalSize();

    // Update widths and positions
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

    // Update stationBox width
    stationBox.width = `100%-${tunerWidth + rdsWidth}`; // Using string expression

    rtBox.width = '100%';

    signalBox.width = '50%';
    statsBox.width = '50%';
    statsBox.left = '50%';

    updateProgressBarWidth();

    // Reposition help box using known dimensions
    const helpBoxHeight = 18; // Height set during creation
    const helpBoxWidth = 60;  // Width set during creation

    if (helpBox) {
        helpBox.top = Math.floor((screen.rows - helpBoxHeight) / 2);
        helpBox.left = Math.floor((screen.cols - helpBoxWidth) / 2);
    }

    // Initialize or remove the extraInfoBox based on new terminal size
    initializeExtraInfoBox();

    screen.render();
});

// Function to update the main box content (Tuner Box)
function updateTunerBox(jsonData) {
    if (!tunerBox || !jsonData) return;

    const padLength = 8;
    const signalValue = parseFloat(jsonData.sig);
    const signalDisplay = isNaN(signalValue) ? 'N/A' : `${signalValue.toFixed(1)} dBf`;
    tunerBox.setContent(
        `${padStringWithSpaces("Freq:", 'green', padLength)}${jsonData.freq} MHz\n` +
        `${padStringWithSpaces("Signal:", 'green', padLength)}${signalDisplay}\n` +
        `${padStringWithSpaces("Mode:", 'green', padLength)}${jsonData.st ? "Stereo" : "Mono"}\n` +
        `${padStringWithSpaces("iMS:", 'green', padLength)}${Number(jsonData.ims) ? "On" : "{grey-fg}Off{/grey-fg}"}\n` +
        `${padStringWithSpaces("EQ:", 'green', padLength)}${Number(jsonData.eq) ? "On" : "{grey-fg}Off{/grey-fg}"}\n` +
        `${padStringWithSpaces("ANT:", 'green', padLength)}${antNames[jsonData.ant] || 'N/A'}\n`);
}

// Function to update the server box
function updateServerBox() {
    if (typeof tunerName !== 'undefined' && tunerName !== '' &&
        typeof tunerDesc !== 'undefined' && tunerDesc !== '') {
        serverBox.setContent(tunerDesc);
        serverBox.setLabel(boxLabel(`Connected to: ${tunerName}`));
        bottomBox.setContent(genBottomText(argUrl));

        // Update the extraInfoBox content if it's displayed
        if (extraInfoBox && !extraInfoBox.hidden) {
            extraInfoBox.setContent('Connected to: ' + (tunerName || 'N/A'));
        }
    }
}

// Function to update the RDS box content
function updateRdsBox(jsonData) {
    if (!rdsBox || !jsonData) return;

    const padLength = 4;
    if (jsonData.freq >= 75 && jsonData.pi !== "?") {
        let msshow;
        if (jsonData.ms === 0) {
            msshow = "{grey-fg}M{/grey-fg}S";
        } else if (jsonData.ms === -1) {
            msshow = "{grey-fg}M{/grey-fg}{grey-fg}S{/grey-fg}";
        } else {
            msshow = "M{grey-fg}S{/grey-fg}";
        }

        rdsBox.setContent(
            `${padStringWithSpaces("PS:", 'green', padLength)}${jsonData.ps.trimStart()}\n` +
            `${padStringWithSpaces("PI:", 'green', padLength)}${jsonData.pi}\n` +
            `{center}{bold}Flags{/bold}\n` +
            `${jsonData.tp ? "TP" : "{grey-fg}TP{/grey-fg}"} ` +
            `${jsonData.ta ? "TA" : "{grey-fg}TA{/grey-fg}"} ` +
            `${msshow}\n` +
            `${jsonData.pty ? europe_programmes[jsonData.pty] : ""}{/center}`
        );
    }
    else {
        rdsBox.setContent('');
    }
}

// Function to update the RT box content
function updateRTBox(jsonData) {
    if (!rtBox || !jsonData) return;

    rtBox.setContent(
        `{center}${jsonData.rt0.trim()}{/center}\n` +
        `{center}${jsonData.rt1.trim()}{/center}`);
}

// Function to update the StationBox
function updateStationBox(txInfo) {
    if (!stationBox || !txInfo) return;

    const padLength = 10;
    if (txInfo.tx) {
        stationBox.setContent(
            `${padStringWithSpaces("Name:", 'green', padLength)}${txInfo.tx}\n` +
            `${padStringWithSpaces("Location:", 'green', padLength)}${txInfo.city + ", " + txInfo.itu}\n` +
            `${padStringWithSpaces("Distance:", 'green', padLength)}${txInfo.dist + " km"}\n` +
            `${padStringWithSpaces("Power:", 'green', padLength)}${txInfo.erp + " kW " + "[" + txInfo.pol + "]"}\n` +
            `${padStringWithSpaces("Azimuth:", 'green', padLength)}${txInfo.azi + "°"}`);
    } else {
        stationBox.setContent("");
    }
}

// Function to update the statsBox
function updateStatsBox(jsonData) {
    if (!statsBox || !jsonData) return;

    statsBox.setContent(
        `{center}Server users: ${jsonData.users}\n` +
        `Server ping: ${pingTime !== null ? pingTime + ' ms' : ''}\n` +
        `Local audio: ${player.getStatus() ? "Playing" : "Stopped"}{/center}`);
}

// Function to scale the progress bar value
function scaleValue(value) {
    const maxvalue = 130; // Set to actual max TEF value
    value = Math.max(0, Math.min(maxvalue, value));
    return Math.floor((value / maxvalue) * 100);
}

// Function to update the signal meter
function updateSignal(signal) {
    if (!progressBar) return;
    progressBar.setProgress(scaleValue(signal));
}

// -----------------------------
// Audio Streaming Setup
// -----------------------------
const player = playAudio(websocketAudio, userAgent, 2048, argv.debug);

// -----------------------------
// Tuner Information Retrieval
// -----------------------------
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

// -----------------------------
// Ping Functionality
// -----------------------------
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
// WebSocket Setup and Event Handlers
// -----------------------------
const wsOptions = userAgent ? { headers: { 'User-Agent': `${userAgent} (control)` } } : {};
const ws = new WebSocket(websocketData, wsOptions);

// WebSocket event handlers
ws.on('open', function () {
    debugLog('WebSocket connection established');
});
ws.on('message', function (data) {
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

            // Update extraInfoBox if it's displayed
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

ws.on('close', function () {
    debugLog('WebSocket connection closed');
});

// -----------------------------
// Key Bindings and Event Handling
// -----------------------------
screen.on('keypress', function (ch, key) {
    if ((key.full === 's') || (key.full === 'right')) { // Increase frequency by 100 kHz
        if (jsonData && jsonData.freq) {
            const newFreq = (jsonData.freq * 1000) + 100;
            ws.send(`T${newFreq}`);
        }
    } else if ((key.full === 'a') || (key.full === 'left')) { // Decrease frequency by 100 kHz
        if (jsonData && jsonData.freq) {
            const newFreq = (jsonData.freq * 1000) - 100;
            ws.send(`T${newFreq}`);
        }
    } else if ((key.full === 'x')) { // Increase frequency by 1 MHz
        if (jsonData && jsonData.freq) {
            const newFreq = (jsonData.freq * 1000) + 1000;
            ws.send(`T${newFreq}`);
        }
    } else if (key.full === 'z') { // Decrease frequency by 1 MHz
        if (jsonData && jsonData.freq) {
            const newFreq = (jsonData.freq * 1000) - 1000;
            ws.send(`T${newFreq}`);
        }
    } else if ((key.full === 'q') || (key.full === 'down')) { // Decrease frequency by 10 kHz
        if (jsonData && jsonData.freq) {
            const newFreq = (jsonData.freq * 1000) - 10;
            ws.send(`T${newFreq}`);
        }
    } else if ((key.full === 'w') || (key.full === 'up')) { // Increase frequency by 10 kHz
        if (jsonData && jsonData.freq) {
            const newFreq = (jsonData.freq * 1000) + 10;
            ws.send(`T${newFreq}`);
        }
    } else if (key.full === '1') { // Decrease frequency by 1 kHz
        if (jsonData && jsonData.freq) {
            const newFreq = (jsonData.freq * 1000) - 1;
            ws.send(`T${newFreq}`);
        }
    } else if (key.full === '2') { // Increase frequency by 1 kHz
        if (jsonData && jsonData.freq) {
            const newFreq = (jsonData.freq * 1000) + 1;
            ws.send(`T${newFreq}`);
        }
    } else if (key.full === 'r') { // Refresh by setting the frequency again
        if (jsonData && jsonData.freq) {
            const newFreq = (jsonData.freq * 1000);
            ws.send(`T${newFreq}`);
        }
    } else if (key.full === 't') { // Set frequency
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
        dialog.input('\n  Enter frequency in MHz', '', function (err, value) {
            if (!err) {
                const newFreq = parseFloat(convertToFrequency(value)) * 1000;
                if (!isNaN(newFreq)) {
                    ws.send(`T${newFreq}`);
                } else {
                    debugLog('Invalid frequency input.');
                }
            }
            dialog.destroy();
            screen.restoreFocus();
            screen.render();
        });
    } else if (key.full === 'h') { // Toggle help visibility
        if (helpBox.hidden) {
            helpBox.show();
        } else {
            helpBox.hide();
        }
        screen.render();
    } else if (key.full === 'p') { // Toggle playback
        if (player.getStatus()) {
            player.stop();
        } else {
            player.play();
        }
        if (jsonData) {
            updateStatsBox(jsonData);
            screen.render();
        }
    } else if (key.full === '[') { // Toggle iMS
        if (jsonData.ims == 1) {
            ws.send(`G${jsonData.eq}0`);
        }
        else {
            ws.send(`G${jsonData.eq}1`);
        }
    } else if (key.full === ']') { // Toggle EQ
        if (jsonData.eq == 1) {
            ws.send(`G0${jsonData.ims}`);
        }
        else {
            ws.send(`G1${jsonData.ims}`);
        }
    } else if (key.full === 'y') { // Toggle antenna
        let newAnt = parseInt(jsonData.ant) + 1;
        if (newAnt >= antNames.length) {
            newAnt = 0;
        }
        ws.send(`Z${newAnt}`);
    }
    else {
        debugLog(key.full);
    }
});

// Quit on Escape, C-c
screen.key(['escape', 'C-c'], function () {
    process.exit(0);
});

// -----------------------------
// Additional Functions
// -----------------------------

// Function to create the extraInfoBox
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

// Function to remove/hide the extraInfoBox
function removeExtraInfoBox() {
    if (extraInfoBox) {
        extraInfoBox.hide();
        screen.render();
    }
}

// Function to initialize the extraInfoBox based on terminal size
function initializeExtraInfoBox() {
    const { rows } = screen;
    if (rows > 25) {
        createExtraInfoBox();
    } else {
        removeExtraInfoBox();
    }
}

// Ensure extraInfoBox is updated when tuner info is updated
function updateServerBox() {
    if (typeof tunerName !== 'undefined' && tunerName !== '' &&
        typeof tunerDesc !== 'undefined' && tunerDesc !== '') {
        serverBox.setContent(tunerDesc);
        serverBox.setLabel(boxLabel(`Connected to: ${tunerName}`));
        bottomBox.setContent(genBottomText(argUrl));

        // Update the extraInfoBox content if it's displayed
        if (extraInfoBox && !extraInfoBox.hidden) {
            extraInfoBox.setContent('Connected to: ' + (tunerName || 'N/A'));
        }
    }
}
