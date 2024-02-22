// (c) Bkram 2024 
// Console client for https://github.com/NoobishSVK/fm-dx-webserver

const WebSocket = require('ws');
const { spawn } = require('child_process');

/**
 * Function to handle WebSocket communication for playing MP3 audio
 * @param {string} websocketAddress - The address of the WebSocket server.
 * @param {string} [userAgent] - Optional user agent string to be used in WebSocket connection headers.
 * @returns {Object} Object with `play` and `stop` methods to control audio playback.
 */
function playMP3FromWebSocket(websocketAddress, userAgent) {
    let ws;
    let mpg123Process;

    /**
     * Starts the audio playback process.
     */
    function startPlayback() {
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
                if (data instanceof ArrayBuffer && mpg123Process) {
                    // If received data is ArrayBuffer (MP3 audio data) and mpg123 process exists,
                    // write it to mpg123 process

                    mpg123Process.stdin.write(Buffer.from(data));
                }
            });
        }

        // Spawn mpg123 process if not already running
        if (!mpg123Process) {
            mpg123Process = spawn('mpg123', ['-']);
            // Event handler for mpg123 process close event
            mpg123Process.on('close', () => {
                mpg123Process = null;  // Reset mpg123 process reference
            });
        }
    }

    /**
     * Stops the audio playback process.
     */
    async function stopPlayback() {
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

        if (mpg123Process) {
            if (!mpg123Process.killed) {
                // Terminate the mpg123 process if it exists and is not already terminated
                mpg123Process.stdin.end();
                await new Promise(resolve => {
                    mpg123Process.on('close', () => {
                        resolve();
                    });
                });
            }
            mpg123Process = null;
        }
    }

    // Return both the play and stop functions
    return { play: startPlayback, stop: stopPlayback };
}

// Export the function for use in other modules
module.exports = playMP3FromWebSocket;
