// (c) Bkram 2024 
// Console client for https://github.com/NoobishSVK/fm-dx-webserver

const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const { spawn } = require('child_process');

// Path to the log file
const logFilePath = path.join(__dirname, 'stream.log');

// Create a writable stream to the log file
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

/**
 * Function to handle WebSocket communication for playing MP3 audio
 * @param {string} websocketAddress - The address of the WebSocket server.
 * @param {string} [userAgent] - Optional user agent string to be used in WebSocket connection headers.
 * @param {number} [bufferSize] - Optional buffer size for reading data from WebSocket and writing to ffplay.
 * @param {boolean} [debug] - Optional boolean to enable/disable logging.
 * @returns {Object} Object with `play` and `stop` methods to control audio playback.
 */
function playMP3FromWebSocket(websocketAddress, userAgent, bufferSize = 1024, debug = false) {
    let ws;
    let ffplayProcess;

    // Function to log messages if debug mode is enabled
    function debugLog(message) {
        if (debug) {
            console.log(message);
        }
    }

    /**
     * Starts the audio playback process.
     */
    function startPlayback() {
        debugLog("Playback started");
        if (!ws || ws.readyState === WebSocket.CLOSED) {
            const wsOptions = userAgent ? { headers: { 'User-Agent': `${userAgent} (audio)` } } : {};
            ws = new WebSocket(websocketAddress, wsOptions);
            ws.binaryType = 'arraybuffer';

            // Send a message to indicate the type of data expected
            ws.on('open', function open() {
                // WebSocket connection is established, send command to request MP3 audio data
                ws.send(JSON.stringify({ type: 'fallback', data: 'mp3' }));
            });

            // Handle incoming audio data
            ws.on('message', function incoming(data) {
                if (data instanceof ArrayBuffer && ffplayProcess) {
                    // If received data is ArrayBuffer (MP3 audio data) and ffplay process exists,
                    // write it to ffplay process
                    if (ffplayProcess.stdin.writable) {
                        ffplayProcess.stdin.write(Buffer.from(data), 'binary');
                    }
                }
            });
        }

        // Spawn ffplay process if not already running
        if (!ffplayProcess) {
            // Define the ffplay command with arguments
            const ffplayCommand = [
                '-autoexit', // Exit when the playback ends
                '-i', '-', // Input from pipe
                '-nodisp', // Disable video output
                '-acodec', 'mp3', // Set the audio codec to MP3
                '-probesize', '32', // remove latency
                '-sync', 'ext' // remove latency
            ];

            // Log the ffplay command if debug mode is enabled
            if (debug) {
                debugLog("FFplay command: ffplay " + ffplayCommand.join(' '));
            }

            // Spawn ffplay process
            ffplayProcess = spawn('ffplay', ffplayCommand);

            // Redirect stderr of ffplay to the log file if debug mode is enabled
            if (debug) {
                ffplayProcess.stderr.pipe(logStream, { end: false });
            }

            // Event handler for ffplay process close event
            ffplayProcess.on('close', () => {
                ffplayProcess = null;  // Reset ffplay process reference
            });
        }
    }

    /**
     * Stops the audio playback process.
     */
    async function stopPlayback() {
        debugLog("Playback stopped");
        if (ws) {
            // Close WebSocket connection if it exists
            try {
                ws.removeAllListeners('message');
                await new Promise(resolve => {
                    ws.on('close', () => {
                        resolve();
                    });
                    ws.close();
                });
            } catch (error) {
                console.error("Error closing WebSocket connection:", error);
            }
            ws = null; // Reset WebSocket instance
        }

        if (ffplayProcess) {
            if (!ffplayProcess.killed) {
                // Terminate the ffplay process if it exists and is not already terminated
                if (ffplayProcess.stdin.writable) {
                    ffplayProcess.stdin.end();
                }
                await new Promise(resolve => {
                    ffplayProcess.on('close', () => {
                        resolve();
                    });
                });
            }
            ffplayProcess = null;
        }
    }

    // Return both the play and stop functions
    return { play: startPlayback, stop: stopPlayback };
}

// Export the function for use in other modules
module.exports = playMP3FromWebSocket;
