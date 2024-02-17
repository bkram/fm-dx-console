// (c) Bkram 2024 
// Console client for https://github.com/NoobishSVK/fm-dx-webserver

const WebSocket = require('ws');
const { spawn } = require('child_process');

// Function to handle WebSocket communication for playing MP3 audio
function playMP3FromWebSocket(websocketAddress) {
    // Create WebSocket instance
    const ws = new WebSocket(websocketAddress);
    ws.binaryType = 'arraybuffer'; // Set binary type to arraybuffer

    let mpg123Process; // Reference to the mpg123 child process

    // Event handler for WebSocket open event
    ws.on('open', function open() {
        // WebSocket connection is established, send command to request MP3 audio data
        ws.send(JSON.stringify({ type: 'fallback', data: 'mp3' }));
    });

    // Event handler for WebSocket message event
    ws.on('message', function incoming(data) {
        if (data instanceof ArrayBuffer) {
            // If received data is ArrayBuffer (MP3 audio data), write it to mpg123 process

            // Create the mpg123 child process if not already created
            if (!mpg123Process) {
                mpg123Process = spawn('mpg123', ['-']);
                // Event handler for mpg123 process close event
                mpg123Process.on('close', () => {
                    mpg123Process = null; // Reset mpg123 process reference
                });
            }

            // Write the received MP3 data to mpg123 process
            mpg123Process.stdin.write(Buffer.from(data));
        }
    });

    // Function to stop playback and close WebSocket connection
    function stopPlayback() {
        if (mpg123Process) {
            // Terminate the mpg123 process if it exists
            mpg123Process.stdin.end();
        }
        ws.close(); // Close WebSocket connection
    }

    // Return the cleanup function
    return stopPlayback;
}

// Export the function for use in other modules
module.exports = playMP3FromWebSocket;
