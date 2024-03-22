// (c) Bkram 2024 
// Console client for https://github.com/NoobishSVK/fm-dx-webserver

const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const { spawn } = require('child_process');

/**
 * Creates a client for playing audio streamed via WebSocket
 * @param {string} websocketAddress The WebSocket server address.
 * @param {string} userAgent The user agent string to be used in WebSocket headers.
 * @param {number} bufferSize The buffer size for the WebSocket connection.
 * @param {boolean} debug Enables debug mode if true.
 * @returns {Object} Object with methods to control playback: play, stop, getStatus.
 */
function play3LAS(websocketAddress, userAgent, bufferSize = 1024, debug = false) {
    let ws;
    let playProcess;
    let isPlaying = false; // Flag to track playback status
    const playCmd = 'ffplay';
    const playArgs = [
        '-autoexit', '-i', '-', '-nodisp', '-acodec', 'mp3',
        '-probesize', '32', '-sync', 'ext', '-ar', '48000',
        '-fflags', '+nobuffer+flush_packets', '-flags', 'low_delay',
        '-rtbufsize', '32', '-nostats', '-loglevel', 'error'
    ];
    const logFilePath = path.join(__dirname, '3lasclient.log');
    const logStream = fs.createWriteStream(logFilePath, { flags: 'w' });

    function debugLog(message) {
        if (debug) {
            logStream.write(message + '\n');
        }
    }

    function startPlayback() {
        debugLog("Playback started");
        if (!ws || ws.readyState === WebSocket.CLOSED) {
            const wsOptions = userAgent ? { headers: { 'User-Agent': `${userAgent} (audio)` } } : {};
            ws = new WebSocket(websocketAddress, wsOptions);
            ws.binaryType = 'arraybuffer';

            ws.on('error', function (error) {
                debugLog("WebSocket error: " + error.message);
            });

            ws.on('open', function open() {
                ws.send(JSON.stringify({ type: 'fallback', data: 'mp3' }));
            });

            ws.on('close', function () {
                debugLog("WebSocket closed");
            });

            ws.on('message', function incoming(data) {
                if (data instanceof ArrayBuffer && playProcess) {
                    if (playProcess.stdin.writable) {
                        playProcess.stdin.write(Buffer.from(data), 'binary');
                    }
                }
            });
        }

        if (!playProcess) {


            if (debug) {
                debugLog("play command: ffplay " + playArgs.join(' ') + "\n");
            }

            playProcess = spawn(playCmd, playArgs);

            if (debug) {
                playProcess.stderr.pipe(logStream, { end: false });
            }

            playProcess.on('close', () => {
                playProcess = null;
            });
        }

        // Set playback status to true when starting playback
        isPlaying = true;
    }

    async function stopPlayback() {
        debugLog("Playback stopped");
        if (ws) {
            try {
                ws.removeAllListeners('message');
                await new Promise(resolve => {
                    ws.on('close', () => {
                        resolve();
                    });
                    ws.close();
                });
            } catch (error) {
                logStream.write("Error closing WebSocket connection:" + error + '\n');
            }
            ws = null;
        }

        if (playProcess) {
            if (!playProcess.killed) {
                if (playProcess.stdin.writable) {
                    playProcess.stdin.end();
                }
                await new Promise(resolve => {
                    playProcess.on('close', () => {
                        resolve();
                    });
                });
            }
            playProcess = null;
        }

        // Set playback status to false when stopping playback
        isPlaying = false;
    }

    // Function to return playback status
    function getStatus() {
        return isPlaying;
    }

    return { play: startPlayback, stop: stopPlayback, getStatus };
}

module.exports = play3LAS;
