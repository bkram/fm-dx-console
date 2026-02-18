const { parentPort, workerData } = require('worker_threads');
const WebSocket = require('ws');
const { spawn } = require('child_process');

let ws = null;
let playProcess = null;
let buffer = [];
let bufferedBytes = 0;
let flushTimer = null;
let url = workerData ? workerData.url : null;
let userAgent = workerData ? workerData.userAgent : null;

// Looser buffering for smoother playback
const playArgs = [
    '-i', '-', '-nodisp', '-acodec', 'mp3',
    '-rtbufsize', '4096k', '-ar', '48000', '-vn', '-loglevel', 'warning'
];

const FLUSH_INTERVAL_MS = 200;
const FLUSH_MIN_BYTES = 8192; // flush sooner if we have enough queued

function flushBuffer(force = false) {
    if (!playProcess || !playProcess.stdin.writable || buffer.length === 0) return;
    if (!force && bufferedBytes < FLUSH_MIN_BYTES) return;
    const data = Buffer.concat(buffer);
    playProcess.stdin.write(data);
    buffer = [];
    bufferedBytes = 0;
}

function startPlayback() {
    if (!url) return;

    if (!ws || ws.readyState === WebSocket.CLOSED) {
        const wsOptions = userAgent ? { headers: { 'User-Agent': `${userAgent} (audio)` } } : {};
        ws = new WebSocket(url, wsOptions);

        ws.on('open', () => {
            ws.send(JSON.stringify({ type: 'fallback', data: 'mp3' }));
        });

        ws.on('message', (data) => {
            const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
            buffer.push(buf);
            bufferedBytes += buf.length;
            flushBuffer();
        });

        ws.on('close', () => { ws = null; });
        ws.on('error', () => { ws = null; });
    }

    if (!playProcess) {
        playProcess = spawn('ffplay', playArgs);
        playProcess.on('close', () => { playProcess = null; });

        if (flushTimer) clearInterval(flushTimer);
        flushTimer = setInterval(() => flushBuffer(true), FLUSH_INTERVAL_MS);
    }
}

function stopPlayback() {
    if (ws) { ws.close(); ws = null; }
    if (playProcess) { playProcess.stdin.end(); playProcess = null; }
    if (flushTimer) { clearInterval(flushTimer); flushTimer = null; }
    buffer = [];
    bufferedBytes = 0;
}

parentPort.on('message', (msg) => {
    if (msg.url) { url = msg.url; userAgent = msg.userAgent; }
    else if (msg.type === 'start') startPlayback();
    else if (msg.type === 'stop') stopPlayback();
});
