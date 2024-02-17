// (c) Bkram 2024 
// Console client for https://github.com/NoobishSVK/fm-dx-webserver

const playMP3FromWebSocket = require('./audiostream');

// Extract the WebSocket address from command-line arguments
const websocketAddress = process.argv[2];
const player = playMP3FromWebSocket(websocketAddress);

// Start playback
player.start();