#!/usr/bin/env node
//
// (c) Bkram 2024 
// Console client for https://github.com/NoobishSVK/fm-dx-webserver

// Import necessary libraries
const blessed = require('reblessed'); // Library for creating terminal-based UI
const { spawn } = require('child_process');
const WebSocket = require('ws'); // WebSocket library for communication
const argv = require('minimist')(process.argv.slice(2)); // Library for parsing command-line arguments


// Check if required arguments are provided
if (!argv.url) {
    console.error('Usage: node fm-dx-console.js --url <websocket_address>');
    process.exit(1);
}

// Global constants
const userAgent = 'Fm-dx-console/1.0';
const europe_programmes = [
    "No PTY", "News", "Current Affairs", "Info",
    "Sport", "Education", "Drama", "Culture", "Science", "Varied",
    "Pop M", "Rock M", "Easy Listening", "Light Classical",
    "Serious Classical", "Other Music", "Weather", "Finance",
    "Children's Programmes", "Social Affairs", "Religion", "Phone-in",
    "Travel", "Leisure", "Jazz Music", "Country Music", "National Music",
    "Oldies Music", "Folk Music", "Documentary", "Alarm Test"
];

// Global variables
let websocketAudio;
let websocketData;
let isPlaying = false; // Flag to track if audio is currently playing
let jsonData = null;

// Extract websocket address from command line arguments
const websocketAddress = formatWebSocketURL(argv.url);
websocketAudio = websocketAddress + '/audio';
websocketData = websocketAddress + '/text';

// Prepare for audio streaming
const playMP3FromWebSocket = require('./audiostream');
const player = playMP3FromWebSocket(websocketAudio, userAgent);

// Create a Blessed screen
const screen = blessed.screen({
    smartCSR: false // Disable resizing
});
const heightInRows = 9;
const tunerWidth = 23;
const rdsWidth = 16;

// Create a title element
const title = blessed.text({
    top: 0,
    left: 0,
    width: 80,
    content: `{bold}fm-dx-console by Bkram{bold}                                        Press \`h\` for help`,
    tags: true,
    style: {
        fg: 'white',
        bg: 'blue',
        bold: true // Make the title bold
    },
});



// Create a box to display server connection
const serverBox = blessed.box({
    top: 1,
    left: 0,
    width: 80,
    height: 4,
    tags: true,
    border: { type: 'line' },
    style: { fg: 'white', border: { fg: '#f0f0f0' } },
    content: `{center}{yellow-fg}{bold}Server{/bold}{/yellow-fg}\n` +
        `Connected to ${websocketAddress}{/center}`
});

// Create a box to display main content
const tunerBox = blessed.box({
    top: 5,
    left: 0,
    width: tunerWidth,
    height: heightInRows,
    tags: true,
    border: { type: 'line' },
    style: { fg: 'white', border: { fg: '#f0f0f0' } },
});

// Create a box to display main content
const rdsBox = blessed.box({
    top: 5,
    left: tunerWidth,
    width: rdsWidth,
    height: heightInRows,
    tags: true,
    border: { type: 'line' },
    style: { fg: 'white', border: { fg: '#f0f0f0' } },
});

// Create a box for City, Distance and Station
const stationBox = blessed.box({
    top: 5,
    left: tunerWidth + rdsWidth,
    width: 80 - (tunerWidth + rdsWidth),
    height: heightInRows,
    tags: true,
    border: { type: 'line' },
    style: { fg: 'white', border: { fg: '#f0f0f0' } },
});


// Create a box for RT0 and RT1
const rtBox = blessed.box({
    top: 14,
    left: 0,
    width: 80,
    height: 5,
    tags: true,
    border: { type: 'line' },
    style: { fg: 'white', border: { fg: '#f0f0f0' } },
});

// Create a signalbox
const signalBox = blessed.box({
    top: 19,
    left: 0,
    width: 40,
    height: 5,
    tags: true,
    border: { type: 'line' },
    style: { fg: 'white', border: { fg: '#f0f0f0' } },
    content: "{center}{bold}{yellow-fg}Signal{/yellow-fg}{/bold}{/center}"
});


// Create the signal meter `progress` bar
const progressBar = blessed.progressbar({
    parent: signalBox,
    top: 21,
    left: 2,
    width: 36,
    height: 1,
    tags: true,
    style: {
        bar: {
            bg: 'green'
        }
    },
    filled: 0,
});

// Create a userbox
const userBox = blessed.box({
    top: 19,
    left: 40,
    width: 40,
    height: 5,
    tags: true,
    border: { type: 'line' },
    style: { fg: 'white', border: { fg: '#f0f0f0' } },
});

// Create a help box
const help = blessed.box({
    top: 4,
    left: 20,
    width: 40,
    height: 20,
    border: 'line',
    style: {
        fg: 'white',
        border: {
            fg: '#f0f0f0'
        }
    },
    content: `{center}{bold}{yellow-fg}Help{/yellow-fg}{/bold}{/center}
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
    '[' toggle iMS
    ']' toggle EQ
    'Esc' to quit
    'h' to toggle this help`,
    tags: true,
    hidden: true
});

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
function padStringWithSpaces(text, totalLength) {
    const spacesToAdd = totalLength - text.length;
    if (spacesToAdd <= 0) return text; // No padding needed if text length is equal or greater than totalLength
    return ' ' + text + ' '.repeat(spacesToAdd);
}

// Function to update the main box content
function updateTunerBox(content) {
    tunerBox.setContent(content);
    screen.render();
}

// Function to update the StationBox
function updateRdsBox(freq, ps, pi, tp, ta, ms, pty) {
    const padLength = 4;
    if (freq >= 75 && pi !== "?") {
        let msshow;
        if (ms === 0) {
            msshow
                = "{grey-fg}M{/grey-fg}S";
        } else if (ms === -1) {
            msshow
                = "{grey-fg}M{/grey-fg}{grey-fg}S{/grey-fg}";
        } else {
            msshow
                = "M{grey-fg}S{/grey-fg}";
        }
        rdsBox.setContent(
            `{center}{bold}{yellow-fg}RDS{/yellow-fg}{/bold}{/center}\n` +
            `${padStringWithSpaces("PS:", padLength)}${ps.trimStart()}\n` +
            `${padStringWithSpaces("PI:", padLength)}${pi}\n` +
            `{center}{bold}Flags{/bold}\n` +
            `${tp ? "TP" : "{grey-fg}TP{/grey-fg}"} ` +
            `${ta ? "TA" : "{grey-fg}TA{/grey-fg}"} ` +
            `${msshow
            }\n` +
            `${pty ? europe_programmes[pty] : ""}{/center}`
        );
    }
    else {
        rdsBox.setContent(
            `{center}{bold}{yellow-fg}RDS{/yellow-fg}{/bold}{/center}\n`)
    }
    screen.render();
}

// Function to update the RT box content
function updateRTBox(rt0, rt1) {
    rtBox.setContent(`{center}{bold}{yellow-fg}RDS Radiotext{/yellow-fg}{/bold}{/center}\n` +
        `{center}${rt0.trim()}{/center}\n` +
        `{center}${rt1.trim()}{/center}`);
    screen.render();
}

// Function to update the StationBox
function updateStationBox(city, distance, station, power, country, polarization, azimuth) {
    const padLength = 10;
    stationBox.setContent(
        `{center}{bold}{yellow-fg}Station Info{/yellow-fg}{/bold}{/center}\n` +
        `${padStringWithSpaces("Station:", padLength)}${station}\n` +
        `${padStringWithSpaces("Location:", padLength)}${city ? city + ", " + country : ""}\n` +
        `${padStringWithSpaces("Distance:", padLength)}${distance ? distance + " km" : ""}\n` +
        `${padStringWithSpaces("Power:", padLength)}${power ? power + " kW " + "[" + polarization + "]" : ""}\n` +
        `${padStringWithSpaces("Azimuth:", padLength)}${azimuth ? azimuth + "°" : ""}`);
    screen.render();
}

// Function to update the userBox
function updateUserBox(users) {
    userBox.setContent(`{center}{bold}{yellow-fg}Users{/yellow-fg}{/bold}{/center}\n` +
        `{center}Online users: ${users}{/center}`);
    screen.render();
}

// Function to scale the progress bar value
function scaleValue(value) {
    const maxvalue = 100; //actual max tef is 130, but 100 seems to be a better option
    // Ensure value is within range [0, maxvalue]
    value = Math.max(0, Math.min(maxvalue, value));
    // Scale value to fit within range [0, 100]
    return Math.floor((value / maxvalue) * 100);
}

// Function to update the signal meter
function updateSignal(signal) {
    progressBar.filled = scaleValue(signal);
}

// WebSocket setup
const wsOptions = userAgent ? { headers: { 'User-Agent': `${userAgent} (control)` } } : {};
const ws = new WebSocket(websocketData, wsOptions);

// WebSocket event handlers
ws.on('open', function () {
    updateTunerBox('WebSocket connection established');
});

ws.on('message', function (data) {
    try {
        jsonData = JSON.parse(data);
        const padLength = 8;
        const content =
            `{center}{bold}{yellow-fg}Tuner{/yellow-fg}{/bold}{/center}\n` +
            `${padStringWithSpaces("Freq:", padLength)}${jsonData.freq} Mhz\n` +
            `${padStringWithSpaces("Signal:", padLength)}${Math.round(jsonData.signal)} dBf\n` +
            `${padStringWithSpaces("Mode:", padLength)}${jsonData.st ? "Stereo" : "Mono"}\n` +
            `${padStringWithSpaces("iMS:", padLength)}${jsonData.ims ? "On" : "{grey-fg}Off{/grey-fg}"}\n` +
            `${padStringWithSpaces("EQ:", padLength)}${jsonData.eq ? "On" : "{grey-fg}Off{/grey-fg}"}\n`;
        updateTunerBox(content);
        updateRdsBox(jsonData.freq, jsonData.ps, jsonData.pi, jsonData.tp, jsonData.ta, jsonData.ms, jsonData.pty)
        updateSignal(jsonData.signal);
        if (jsonData && jsonData.txInfo) {
            updateStationBox(jsonData.txInfo.city, jsonData.txInfo.distance, jsonData.txInfo.station, jsonData.txInfo.erp, jsonData.txInfo.itu, jsonData.txInfo.pol, jsonData.txInfo.azimuth);
        }
        if (jsonData && jsonData.rt0 !== undefined && jsonData.rt1 !== undefined) {
            updateRTBox(jsonData.rt0, jsonData.rt1);
        }
        if (jsonData && jsonData.txInfo) {
            updateStationBox(jsonData.txInfo.city, jsonData.txInfo.distance, jsonData.txInfo.station, jsonData.txInfo.erp, jsonData.txInfo.itu, jsonData.txInfo.pol, jsonData.txInfo.azimuth);
        }
        if (jsonData && jsonData.users !== undefined) {
            updateUserBox(jsonData.users);
        }

    } catch (error) {
        console.error('Error parsing JSON:', error);
    }
});

ws.on('close', function () {
    updateTunerBox('WebSocket connection closed');
});

// Listen for key events
screen.on('keypress', function (ch, key) {
    if (key.full === 's') { // Decrease frequency by 100 kHz
        if (jsonData && jsonData.freq) {
            const newFreq = (jsonData.freq * 1000) + 100;
            ws.send(`T${newFreq}`);
        }
    } else if (key.full === 'a') { // Increase frequency by 100 kHz
        if (jsonData && jsonData.freq) {
            const newFreq = (jsonData.freq * 1000) - 100;
            ws.send(`T${newFreq}`);
        }
    } else if (key.full === 'x') { // Decrease frequency by 1 MHz
        if (jsonData && jsonData.freq) {
            const newFreq = (jsonData.freq * 1000) + 1000;
            ws.send(`T${newFreq}`);
        }
    } else if (key.full === 'z') { // Increase frequency by 1 MHz
        if (jsonData && jsonData.freq) {
            const newFreq = (jsonData.freq * 1000) - 1000;
            ws.send(`T${newFreq}`);
        }
    } else if (key.full === 'q') { // Decrease frequency by 0.01 MHz
        if (jsonData && jsonData.freq) {
            const newFreq = (jsonData.freq * 1000) - 10;
            ws.send(`T${newFreq}`);
        }
    } else if (key.full === 'w') { // Increase frequency by 0.01 MHz
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
            top: 10,
            left: 25,
            width: 30,
            height: 'shrink',
            border: 'line',
            style: {
                fg: 'white',
                border: {
                    fg: '#f0f0f0'
                }
            },
            label: ' Enter frequency in MHz: ',
            tags: true,
        });
        screen.append(dialog);
        screen.render();
        dialog.input('', '', function (err, value) {
            if (!err) {
                const newFreq = parseFloat(value) * 1000; // Convert MHz to kHz
                ws.send(`T${newFreq}`);
            }
            dialog.destroy();
            screen.restoreFocus();
            screen.render();
        });
    } else if (key.full === 'h') { // Toggle help visibility
        if (help.hidden) {
            help.show();
        } else {
            help.hide();
        }
    } else if (key.full === 'p') { // Toggle playback
        if (isPlaying) {
            player.stop(); // Stop playback if currently playing
            isPlaying = false;
        } else {
            player.play(); // Start playback if not playing
            isPlaying = true;
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
    }
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
screen.append(userBox);
screen.append(progressBar);
screen.append(help);

// Quit on Escape, q, or Control-C
screen.key(['escape', 'C-c'], function () {
    process.exit(0);
});
