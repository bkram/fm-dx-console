#!/usr/bin/env node
//
// (c) Bkram 2024 
// Console client for https://github.com/NoobishSVK/fm-dx-webserver

// Imports
const argv = require('minimist')(process.argv.slice(2), { // Library for parsing command-line arguments
    string: ['url'], // Treat url as a string
    boolean: ['debug'] // Treat debug as a boolean flag
});
const blessed = require('reblessed'); // Library for creating terminal-based UI
const fs = require('fs');
const { spawn } = require('child_process');
const { url } = require('inspector');
const path = require('path');
const WebSocket = require('ws'); // WebSocket library for communication
const { getTunerInfo, getPingTime } = require('./tunerinfo');
const playAudio = require('./3lasclient');

// Global constants
const europe_programmes = [
    "No PTY", "News", "Current Affairs", "Info",
    "Sport", "Education", "Drama", "Culture", "Science", "Varied",
    "Pop M", "Rock M", "Easy Listening", "Light Classical",
    "Serious Classical", "Other Music", "Weather", "Finance",
    "Children's Programmes", "Social Affairs", "Religion", "Phone-in",
    "Travel", "Leisure", "Jazz Music", "Country Music", "National Music",
    "Oldies Music", "Folk Music", "Documentary", "Alarm Test"
];
const version = '1.4'
const userAgent = `fm-dx-console/${version}`;
const heightInRows = 8;
const tunerWidth = 24;
const rdsWidth = 17;
const titleStyle = { fg: 'black', bg: 'green', bold: true }
const boxStyle = { border: { fg: 'green', bg: 'blue' }, bg: 'blue' }

// Global variables
let jsonData = null;
let tunerDesc;
let tunerName;
let websocketAudio;
let websocketData;
let argDebug = argv.debug;
let argUrl;
let pingTime = null;


// Path to the log file
const logFilePath = path.join(__dirname, 'console.log');
const logStream = fs.createWriteStream(logFilePath, { flags: 'w' });

// Check if required arguments are provided
if (!argv.url) {
    console.error('Usage: node fm-dx-console.js --url <fm-dx> [--debug]');
    process.exit(1);
}
else {
    argUrl = argv.url.toLowerCase().replace("#", "").replace("?", "");
}

if (isValidURL(argUrl)) {
    // URL is valid, proceed with processing
    websocketAddress = formatWebSocketURL(argUrl);
    websocketAudio = `${websocketAddress}/audio`;
    websocketData = `${websocketAddress}/text`;
} else {
    console.error("Invalid URL provided.");
    process.exit(1)
}

// Function to convert number to frequency
function convertToFrequency(num) {
    // Check if the input is null, undefined, or cannot be converted to a number
    if (num === null || num === undefined || isNaN(Number(num.toString().replace(',', '.')))) {
        return null; // or any other default value like 0 or NaN
    }

    // Convert the input to a floating-point number
    num = parseFloat(num.toString().replace(',', '.'));

    // Scale down if the number is too large
    while (num >= 100) num /= 10;

    // Scale up if the number is too small
    if (num < 76) num *= 10;

    // Round to one decimal place and return
    return Math.round(num * 10) / 10;
}

function genBottomText(variableString) {
    const helpString = "Press `h` for help";
    const totalWidth = 78;
    const maxVariableLength = totalWidth - (helpString.length + 1);
    const truncatedVariableString = variableString.length > maxVariableLength
        ? variableString.substring(0, maxVariableLength)
        : variableString;
    const paddingLength = totalWidth - truncatedVariableString.length - helpString.length;
    return ' ' + truncatedVariableString + ' '.repeat(paddingLength) + helpString + ' ';
}


// Prepare for audio streaming
const player = playAudio(websocketAudio, userAgent, 2048, argv.debug);

// Create a Blessed screen
const screen = blessed.screen({
    smartCSR: true, // Disable resizing
    fastCSR: false, // Disable resizing
    mouse: true, // Enable mouse support
    fullUnicode: false, // Support Unicode characters
    dockBorders: true,
    style: {
        bg: 'blue'
    }

});

// debug logging to file
function debugLog(...args) {
    if (argDebug) {
        const message = args.join(' '); // Join all arguments into a single string
        logStream.write(message + '\n');
    }
}

// get tuner info from fm-dx-webserver
async function tunerInfo() {
    try {
        const result = await getTunerInfo(argUrl);
        tunerName = result.tunerName;
        tunerDesc = result.tunerDesc;
        antNames = result.antNames;
    } catch (error) {
        debugLog(error.message);
    }
}

// Call to trigger async function tunerInfo
tunerInfo();

// Create a title element
const title = blessed.text({
    top: 0,
    left: 0,
    width: 80,
    content: ` fm-dx-console ${version} by Bkram`,
    tags: true,
    style: titleStyle,
});

// Create a box to display server connection
const serverBox = blessed.box({
    top: 1,
    left: 0,
    width: 80,
    height: 5,
    tags: true,
    border: { type: 'line' },
    style: boxStyle,
    label: boxLabel('Connected to:')
});

function boxLabel(label) {
    return `{white-fg}{blue-bg}{bold}${label}{/bold}{/blue-bg}{/white-fg}`;
}

// Create a box to display main content
const tunerBox = blessed.box({
    top: 6,
    left: 0,
    width: tunerWidth,
    height: heightInRows,
    tags: true,
    border: { type: 'line' },
    style: boxStyle,
    label: boxLabel('Tuner')

});

// Create a box to display main content
const rdsBox = blessed.box({
    top: 6,
    left: tunerWidth - 1,
    width: rdsWidth,
    height: heightInRows,
    tags: true,
    border: { type: 'line' },
    style: boxStyle,
    label: boxLabel('RDS')
});

// Create a box for City, Distance and Station
const stationBox = blessed.box({
    top: 6,
    left: tunerWidth + rdsWidth - 2,
    width: 80 - (tunerWidth + rdsWidth - 2),
    height: heightInRows,
    tags: true,
    border: { type: 'line' },
    style: boxStyle,
    label: boxLabel('Station Information')
});

// Create a box for RT0 and RT1
const rtBox = blessed.box({
    top: 14,
    left: 0,
    width: 80,
    height: 4,
    tags: true,
    border: { type: 'line' },
    style: boxStyle,
    label: boxLabel("RDS Radiotext")
});

// Create a signalbox
const signalBox = blessed.box({
    top: 18,
    left: 0,
    width: 40,
    height: 5,
    tags: true,
    border: { type: 'line' },
    style: boxStyle,
    label: boxLabel("Signal")
});

// Create the signal meter `progress` bar
const progressBar = blessed.progressbar({
    parent: signalBox,
    top: 20,
    left: 2,
    width: 35,
    height: 1,
    tags: true,
    style: {
        bar: {
            bg: 'red'
        }
    },
    filled: 0,
});

// Create a statsBox
const statsBox = blessed.box({
    top: 18,
    left: 38,
    width: 42,
    height: 5,
    tags: true,
    border: { type: 'line' },
    style: boxStyle,
    label: boxLabel("Statistics"),
});

// Create a bottom title `bar`
const bottomBox = blessed.box({
    top: 23,
    left: 0,
    width: 80,
    height: 1,
    tags: true,
    style: titleStyle,
    // content: ' https://github.com/bkram/fm-dx-console                      Press \`h\` for help'
    content: '                                                             Press \`h\` for help'
});


// Create a help box
const helpBox = blessed.box({
    top: 3,
    left: 20,
    width: 40,
    height: 19,
    border: { type: 'line' },
    style: boxStyle,
    label: boxLabel('Help'),
    content: `
    Press key to:
    '1' to decrease by .001 Mhz
    '2' to increase by .001 Mhz
    'q' to decrease by .01 Mhz
    'w' to increase by .01 Mhz
    'a' to decrease by .1 Mhz
    's' to increase by .1 Mhz
    'z' to decrease by 1 Mhz
    'x' to increase by 1 Mhz
    'r' to refresh
    't' to set frequency
    'p' to play audio
    '[' toggle TEF iMS | XDR-F1HD IF+
    ']' toggle TEF EQ | XDR-F1HD RF+
    'Esc' to quit
    'h' to toggle this help`,
    tags: true,
    hidden: true,
});

// Create a clock element
const clockText = blessed.text({
    content: '',
    top: 0,
    left: 80 - 9,
    tags: true,
    style: titleStyle,

});

// Function to check for http(s):
function isValidURL(url) {
    const pattern = /^(https?):\/\/.+/;
    return pattern.test(url);
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

// Function to check terminal dimensions
function checkTerminalSize() {
    const { cols, rows } = screen.program;
    if (cols < 80 || rows < 24) {
        console.error('Terminal size is smaller than 80x24. Exiting...');
        process.exit(1);
    }
}

// Function to do some padding
function padStringWithSpaces(text, color = 'green', totalLength) {
    // Regular expression to match anything within { and }
    const tagRegex = /\{(.*?)\}/g;
    // Replace all occurrences of tags with an empty string to exclude them from padding length calculation
    const strippedText = text.replace(tagRegex, '');

    const spacesToAdd = totalLength - strippedText.length;
    if (spacesToAdd <= 0) return text; // No padding needed if text length is equal or greater than totalLength
    return ' ' + `{${color}-fg}` + text + `{/${color}-fg}` + ' '.repeat(spacesToAdd);
}

// Function to update the main box content
function updateTunerBox(jsonData) {
    const padLength = 8;
    tunerBox.setContent(
        `${padStringWithSpaces("Freq:", 'green', padLength)}${jsonData.freq} Mhz\n` +
        `${padStringWithSpaces("Signal:", 'green', padLength)}${parseFloat(jsonData.sig).toFixed(1)} dBf\n` +
        `${padStringWithSpaces("Mode:", 'green', padLength)}${jsonData.st ? "Stereo" : "Mono"}\n` +
        `${padStringWithSpaces("iMS:", 'green', padLength)}${jsonData.ims ? "On" : "{grey-fg}Off{/grey-fg}"}\n` +
        `${padStringWithSpaces("EQ:", 'green', padLength)}${jsonData.eq ? "On" : "{grey-fg}Off{/grey-fg}"}\n` +
        `${padStringWithSpaces("ANT:", 'green', padLength)}${antNames[jsonData.ant]}\n`);
}

// function to update the serverbox
function updateServerBox() {
    if (typeof tunerName !== 'undefined' && tunerName.text !== '' &&
        typeof tunerDesc !== 'undefined' && tunerDesc.text !== '' &&
        serverBox.content === '') {
        serverBox.setContent(tunerDesc);
        serverBox.setLabel(boxLabel(`Connected to: ${tunerName}`));
        bottomBox.setContent(genBottomText(argUrl))
    }
}

// Function to update the StationBox
function updateRdsBox(jsonData) {
    const padLength = 4;
    if (jsonData.freq >= 75 && jsonData.pi !== "?") {
        let msshow;
        if (jsonData.ms === 0) {
            msshow
                = "{grey-fg}M{/grey-fg}S";
        } else if (jsonData.ms === -1) {
            msshow
                = "{grey-fg}M{/grey-fg}{grey-fg}S{/grey-fg}";
        } else {
            msshow
                = "M{grey-fg}S{/grey-fg}";
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
        rdsBox.setContent()
    }
}

// Function to update the RT box content
function updateRTBox(jsonData) {
    rtBox.setContent(
        `{center}${jsonData.rt0.trim()}{/center}\n` +
        `{center}${jsonData.rt1.trim()}{/center}`);
}

// Function to update the StationBox
function updateStationBox(txInfo) {
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
    statsBox.setContent(
        `{center}Server users: ${jsonData.users}\n` +
        `Server ping: ${pingTime !== null ? pingTime + ' ms' : ''}\n` +
        `Local audio: ${player.getStatus() ? "Playing" : "Stopped"}{/center}`);
}

// Function to scale the progress bar value
function scaleValue(value) {
    const maxvalue = 100; // Actual max tef is 130, but 100 seems to be more practical value
    // Ensure value is within range [0, maxvalue]
    value = Math.max(0, Math.min(maxvalue, value));
    // Scale value to fit within range [0, 100]
    return Math.floor((value / maxvalue) * 100);
}

// Function to update the signal meter
function updateSignal(signal) {
    progressBar.filled = scaleValue(signal);
}

// Function to update the clock content
function updateClock(clockText) {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    const timeStr = `${hours}:${minutes}:${seconds}`;
    clockText.setContent(timeStr);
}

// Update the clock content every second
setInterval(() => {
    updateClock(clockText);
    screen.render();
}, 1000);

// Get ping every 5 seconds
async function doPing() {
    try {
        pingTime = await getPingTime(argUrl);
        debugLog('Ping Time:', pingTime, 'ms');
    } catch (error) {
        debugLog('Ping Error:', error.message);
    }
}
doPing();
setInterval(doPing, 5000);

// WebSocket setup
const wsOptions = userAgent ? { headers: { 'User-Agent': `${userAgent} (control)` } } : {};
const ws = new WebSocket(websocketData, wsOptions);

// WebSocket event handlers
ws.on('open', function () {
    debugLog('WebSocket connection established');
});
ws.on('message', function (data) {
    try {

        updateServerBox();

        jsonData = JSON.parse(data);
        updateTunerBox(jsonData);
        updateRdsBox(jsonData);
        updateSignal(jsonData.sig);
        updateStationBox(jsonData.txInfo);
        updateRTBox(jsonData);
        updateStatsBox(jsonData);
        screen.render();
    } catch (error) {
        debugLog('Error parsing JSON:', error);
    }
});

ws.on('close', function () {
    debugLog('WebSocket connection closed');
});

// Check terminal size initially
checkTerminalSize();

// Append boxes
screen.append(title);
screen.append(serverBox);
screen.append(tunerBox);
screen.append(rdsBox);
screen.append(stationBox);
screen.append(rtBox);
screen.append(signalBox);
screen.append(statsBox);
screen.append(progressBar);
screen.append(helpBox);
screen.append(bottomBox);
screen.append(clockText);

// Listen for key events
screen.on('keypress', function (ch, key) {
    if ((key.full === 's') || (key.full === 'right')) { //  Increase frequency by 100 kHz
        if (jsonData && jsonData.freq) {
            const newFreq = (jsonData.freq * 1000) + 100;
            ws.send(`T${newFreq}`);
        }
    } else if ((key.full === 'a') || (key.full === 'left')) { // Decrease frequency by 100 kHz
        if (jsonData && jsonData.freq) {
            const newFreq = (jsonData.freq * 1000) - 100;
            ws.send(`T${newFreq}`);
        }
    } else if ((key.full === 'x')) { // Decrease frequency by 1 MHz
        if (jsonData && jsonData.freq) {
            const newFreq = (jsonData.freq * 1000) + 1000;
            ws.send(`T${newFreq}`);
        }
    } else if (key.full === 'z') { // Increase frequency by 1 MHz
        if (jsonData && jsonData.freq) {
            const newFreq = (jsonData.freq * 1000) - 1000;
            ws.send(`T${newFreq}`);
        }
    } else if ((key.full === 'q') || (key.full === 'down')) { // Decrease frequency by 0.01 MHz
        if (jsonData && jsonData.freq) {
            const newFreq = (jsonData.freq * 1000) - 10;
            ws.send(`T${newFreq}`);
        }
    } else if ((key.full === 'w') || (key.full === 'up')) { // Increase frequency by 0.01 MHz
        if (jsonData && jsonData.freq) {
            const newFreq = (jsonData.freq * 1000) + 10;
            ws.send(`T${newFreq}`);
        }
    } else if (key.full === '1') { // Decrease frequency by 0.01 MHz
        if (jsonData && jsonData.freq) {
            const newFreq = (jsonData.freq * 1000) - 1;
            ws.send(`T${newFreq}`);
        }
    } else if (key.full === '2') { // Increase frequency by 0.01 MHz
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
        // Create a dialog box to get the frequency from the user
        const dialog = blessed.prompt({
            top: 8,
            left: 25,
            width: 30,
            height: 8,
            border: 'line',
            style: boxStyle,
            label: boxLabel('Direct Tuning'),
            tags: true,
        });
        screen.append(dialog);
        dialog.input('\n  Enter frequency in Mhz', '', function (err, value) {
            if (!err) {
                const newFreq = parseFloat(convertToFrequency(value)) * 1000; // Convert MHz to kHz
                ws.send(`T${newFreq}`);
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
    } else if (key.full === 'p') { // Toggle playback
        if (player.getStatus()) {
            player.stop(); // Stop playback if currently playing
        } else {
            player.play(); // Start playback if not playing
        }
    } else if (key.full === '[') { // toggle ims
        if (jsonData.ims == 1) {
            ws.send(`G${jsonData.eq}0`);
        }
        else {
            ws.send(`G${jsonData.eq}1`);
        }
    } else if (key.full === ']') { // toggle eq
        if (jsonData.eq == 1) {
            ws.send(`G0${jsonData.ims}`);
        }
        else {
            ws.send(`G1${jsonData.ims}`);
        }
    } else if (key.full === 'y') { // toggle antenna
        let newAnt = parseInt(jsonData.ant) + 1;
        if (newAnt >= antNames.length) {
            newAnt = 0;
        }
        ws.send(`Z${newAnt}`);
    }
    else {
        debugLog(key.full)
    }
});

// Quit on Escape, q, or Control-C
screen.key(['escape', 'C-c'], function () {
    process.exit(0);
});

