#!/usr/bin/env node
//
// (c) Bkram 2024 
// Console client for https://github.com/NoobishSVK/fm-dx-webserver

// Import necessary libraries
const blessed = require('blessed'); // Library for creating terminal-based UI
const { spawn } = require('child_process');
const WebSocket = require('ws'); // WebSocket library for communication
const argv = require('minimist')(process.argv.slice(2)); // Library for parsing command-line arguments

// Check if required arguments are provided
if (!argv.url) {
    console.error('Usage: node fm-dx-console.js --url <websocket_address>');
    process.exit(1);
}

// Declare websocketAudioAddress variable outside of the scope
let websocketAudioAddress;

// Extract websocket address from command line arguments
const websocketAddress = argv.url;

// Check if the URL starts with 'ws://'
if (websocketAddress.startsWith('ws://')) {
    // Replace any port number with 8081
    websocketAudioAddress = websocketAddress.replace(/:\d+$/, ':8081');
} else if (websocketAddress.startsWith('wss://')) {
    // Append "/stream/" to the URL for wss:// addresses
    websocketAudioAddress = websocketAddress + 'stream/';
} else {
    console.log('URL does not start with ws:// or wss://. No modification needed.');
    process.exit(1); // Exit with a non-zero status code to indicate an error
}

// Start playback in a separate process and pass the WebSocket address as a command-line argument
const playMP3FromWebSocket = require('./audiostream');
const player = playMP3FromWebSocket(websocketAudioAddress);
const playbackProcess = spawn('node', ['playback.js', websocketAudioAddress]);

// Create a Blessed screen
const screen = blessed.screen({ smartCSR: true });

// Create a title element
const title = blessed.text({
    top: 0,
    left: 0,
    width: '100%', // Set width to occupy the full width of the screen
    content: `  fm-dx-console by Bkram | Server: ${websocketAddress}`, // Include the URL
    tags: true,
    style: {
        fg: 'white',
        bg: 'blue',
        bold: true // Make the title bold
    },
});

// Create a clock widget
const clock = blessed.text({
    top: 0,
    right: 0,
    width: '10%', // Set width to occupy 20% of the screen
    align: 'right',
    content: '{bold}00:00{/bold}', // Initial placeholder content
    tags: true,
    style: {
        fg: 'white',
        bg: 'blue'
    },
});

// Create a box to display main content
const tunerBox = blessed.box({
    top: 1, // Leave space for the title
    left: 0,
    width: '30%', // Occupy 30% of the screen width
    height: '50%', // Reduce height to accommodate the additional view below
    tags: true,
    border: { type: 'line' },
    style: { fg: 'white', border: { fg: '#f0f0f0' } },
});

// Create a box for City, Distance, and Station
const stationBox = blessed.box({
    top: 1,
    left: '30%', // Position it to the right of the tuner box
    width: '60%', // Occupy 60% of the screen width
    height: '50%', // Occupy 40% of the screen height
    tags: true,
    border: { type: 'line' },
    style: { fg: 'white', border: { fg: '#f0f0f0' } },
});

// Create a box for RT0 and RT1
const rtBox = blessed.box({
    top: '50%', // Position it below the main box
    left: 0,
    width: '100%', // Occupy 100% of the screen width
    height: '25%', // Occupy 25% of the screen height
    tags: true,
    border: { type: 'line' },
    style: { fg: 'white', border: { fg: '#f0f0f0' } },
});

const userBox = blessed.box({
    top: '75%', // Position it below the rtBox
    left: 0,
    width: '100%', // Occupy 100% of the screen width
    height: '25%', // Occupy 25% of the screen height
    tags: true,
    border: { type: 'line' },
    style: { fg: 'white', border: { fg: '#f0f0f0' } },
});

// Create a help box
const help = blessed.box({
    top: 'center',
    left: 'center',
    width: '50%',
    height: '50%',
    border: 'line',
    style: {
        fg: 'white',
        bg: 'black',
        border: {
            fg: '#f0f0f0'
        }
    },
    content: `{center}{bold}Help{/bold}{/center}\n Press keys:\n 'q' to decrease by 1000 kHz\n 'w' to increase by 1000 kHz\n 'z' to decrease by 10 kHz\n 'x' to increase by 10 kHz\n 'a' to decrease by 100 kHz\n 's' to increase 100 kHz\n 'r' to refresh\n '.' to quit\n 't' to set frequency\n 'h' to toggle this help`,
    tags: true,
    hidden: true
});

// Append title, clock, main box, help box, rt box, and cityDistanceStation box to the screen
screen.append(title);
screen.append(clock);
screen.append(tunerBox);
screen.append(stationBox);
screen.append(rtBox);
screen.append(userBox);
screen.append(help);

// Function to update the main box content
function updateTunerBox(content) {
    tunerBox.setContent(content);
    screen.render();
}

// Function to update the RT box content
function updateRTBox(rt0, rt1) {
    rtBox.setContent(`{center}{bold}Radiotext{/bold}{/center}\n{center}${rt0.trim()}{/center}\n{center}${rt1.trim()}{/center}`);
    screen.render();
}

// Function to update the City, Distance, and Station box content
function updateStationBox(city, distance, station, power, country, polarization, azimuth) {
    stationBox.setContent(`{center}{bold}Station Data{/bold}{/center}\n Station: ${station}\n Location: ${city}, ${country}\n Distance: ${distance} km\n Power: ${power} kW [${polarization}]\n Azimuth: ${azimuth}`);
    screen.render();
}

// Function to update the User box content
function updateUserBox(users) {
    userBox.setContent(`{center}{bold}Users{/bold}{/center}\n Users: ${users}`);
    screen.render();
}

// Update clock function
function updateClock() {
    const now = new Date();
    const hours = ('0' + now.getHours()).slice(-2); // Get hours in 2-digit format
    const minutes = ('0' + now.getMinutes()).slice(-2); // Get minutes in 2-digit format
    const timeString = `${hours}:${minutes}`;
    clock.setContent(`{right}{bold}${timeString}{/bold}{/right}`);
    screen.render();
}

// Update clock every second
setInterval(updateClock, 1000);

// Initialize JSON data variable
let jsonData = null;

// WebSocket setup
const ws = new WebSocket(websocketAddress);

// WebSocket event handlers
ws.on('open', function () {
    updateTunerBox('WebSocket connection established');
});

ws.on('message', function (data) {
    try {
        jsonData = JSON.parse(data);
        const content = `{center}{bold}Tuner{/bold}{/center}\n PS: ${jsonData.ps}\n PI: ${jsonData.pi}\n Frequency: ${jsonData.freq}\n Signal: ${jsonData.signal}\n Stereo: ${jsonData.st}\n `;
        updateTunerBox(content);
        if (jsonData && jsonData.txInfo) {
            updateStationBox(jsonData.txInfo.city, jsonData.txInfo.distance, jsonData.txInfo.station, jsonData.txInfo.erp, jsonData.txInfo.itu, jsonData.txInfo.pol, jsonData.txInfo.azimuth);
        }
        if (jsonData && jsonData.rt0 !== undefined && jsonData.rt1 !== undefined) {
            updateRTBox(jsonData.rt0, jsonData.rt1);
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
    } else if (key.full === 'q') { // Decrease frequency by 1 MHz
        if (jsonData && jsonData.freq) {
            const newFreq = (jsonData.freq * 1000) - 1000;
            ws.send(`T${newFreq}`);
        }
    } else if (key.full === 'w') { // Increase frequency by 1 MHz
        if (jsonData && jsonData.freq) {
            const newFreq = (jsonData.freq * 1000) + 1000;
            ws.send(`T${newFreq}`);
        }
    } else if (key.full === 'z') { // Decrease frequency by 0.01 MHz
        if (jsonData && jsonData.freq) {
            const newFreq = (jsonData.freq * 1000) - 10;
            ws.send(`T${newFreq}`);
        }
    } else if (key.full === 'x') { // Increase frequency by 0.01 MHz
        if (jsonData && jsonData.freq) {
            const newFreq = (jsonData.freq * 1000) + 10;
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
            top: 'center',
            left: 'center',
            width: '20%',
            height: 'shrink',
            border: 'line',
            style: {
                fg: 'white',
                bg: 'black',
                border: {
                    fg: '#f0f0f0'
                }
            },
            label: ' Enter frequency in MHz: ',
            tags: true
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
    }
});

// Quit on Escape, q, or Control-C
screen.key(['escape', '.', 'C-c'], function () {
    process.exit(0);
});

// Update clock initially
updateClock();
