// (c) Bkram 2024 
// Console client for https://github.com/NoobishSVK/fm-dx-webserver

const WebSocket = require('ws');
const { spawn } = require('child_process');

// Function to handle WebSocket communication for playing MP3 audio
function playMP3FromWebSocket(websocketAddress) {
    let ws; // WebSocket instance
    let mpg123Process; // Reference to the mpg123 child process

    // Function to start playback
    function startPlayback() {
        // Create WebSocket instance if not already created or if it's closed
        if (!ws || ws.readyState === WebSocket.CLOSED) {
            ws = new WebSocket(websocketAddress);
            ws.binaryType = 'arraybuffer'; // Set binary type to arraybuffer

            // Event handler for WebSocket open event
            ws.on('open', function open() {
                // WebSocket connection is established, send command to request MP3 audio data
                ws.send(JSON.stringify({ type: 'fallback', data: 'mp3' }));
            });

            // Event handler for WebSocket message event
            ws.on('message', function incoming(data) {
                if (data instanceof ArrayBuffer && mpg123Process) {
                    // If received data is ArrayBuffer (MP3 audio data) and mpg123 process exists,
                    // write it to mpg123 process
                    mpg123Process.stdin.write(Buffer.from(data));
                }
            });
        }

        // Spawn mpg123 process if it's not already running
        if (!mpg123Process) {
            mpg123Process = spawn('mpg123', ['-']);
            // Event handler for mpg123 process close event
            mpg123Process.on('close', () => {
                mpg123Process = null; // Reset mpg123 process reference
            });
        }
    }

    // Function to stop playback and close WebSocket connection
    function stopPlayback() {
        if (ws) {
            ws.close(); // Close WebSocket connection if it exists
            ws = null; // Reset WebSocket instance
        }

        if (mpg123Process) {
            // Terminate the mpg123 process if it exists
            mpg123Process.stdin.end();
        }
    }
    
    // Return both the play and stop functions
    return { play: startPlayback, stop: stopPlayback };
}

// Export the function for use in other modules
module.exports = playMP3FromWebSocket;
