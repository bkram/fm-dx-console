const { parentPort, workerData } = require('worker_threads');
const WebSocket = require('ws');
const { spawn } = require('child_process');

let ws = null;
let player = null;         // ffplay: decodes MP3 + applies volume + plays
let meter = null;          // ffmpeg: same MP3 in, levels metadata out
let buffer = [];
let bufferedBytes = 0;
let flushTimer = null;
let url = workerData ? workerData.url : null;
let userAgent = workerData ? workerData.userAgent : null;
let volume = workerData && Number.isFinite(workerData.volume) ? workerData.volume : 100;
let stderrLineBuf = '';
let lastLevelL = 0;
let lastLevelR = 0;
let pendingLevelSend = null;
const LEVEL_SEND_MS = 80;

const FLUSH_INTERVAL_MS = 40;
const FLUSH_MIN_BYTES = 2048;
// Max in-flight bytes in each child's stdin pipe before we start dropping
// chunks to keep audio in sync with real time. ~256 KB ≈ 1.3 s of 128 kbps MP3.
const STDIN_QUEUE_MAX = 256 * 1024;

function playerArgs() {
    const v = Math.max(0, Math.min(100, Math.round(volume)));
    return [
        '-loglevel', 'warning',
        '-nodisp',
        '-fflags', 'nobuffer',
        '-flags', 'low_delay',
        '-probesize', '32',
        '-analyzeduration', '0',
        '-acodec', 'mp3',
        '-volume', String(v),
        '-rtbufsize', '256k',
        '-ar', '48000',
        '-vn',
        '-i', 'pipe:0',
    ];
}

function meterArgs() {
    return [
        '-loglevel', 'quiet',
        '-fflags', 'nobuffer',
        '-flags', 'low_delay',
        '-probesize', '32',
        '-analyzeduration', '0',
        '-f', 'mp3',
        '-i', 'pipe:0',
        '-af', 'astats=metadata=1:reset=0.1,ametadata=mode=print:file=-',
        '-f', 'null',
        '-',
    ];
}

let dropsSinceReport = 0;

function safeWrite(proc, data, label) {
    if (!proc || !proc.stdin || !proc.stdin.writable) return;
    // If Node's internal buffer for this stdin is over the threshold the child
    // can't keep up; drop this chunk to keep audio in sync with real time
    // instead of letting latency accumulate.
    if (proc.stdin.writableLength + data.length > STDIN_QUEUE_MAX) {
        dropsSinceReport += data.length;
        return;
    }
    try { proc.stdin.write(data); } catch (e) { /* ignore */ }
}

function flushBuffer(force = false) {
    if (buffer.length === 0) return;
    if (!force && bufferedBytes < FLUSH_MIN_BYTES) return;
    const data = Buffer.concat(buffer);
    buffer = [];
    bufferedBytes = 0;
    safeWrite(player, data, 'player');
    safeWrite(meter, data, 'meter');
}

function sendLevelsThrottled() {
    if (pendingLevelSend) return;
    pendingLevelSend = setTimeout(() => {
        pendingLevelSend = null;
        parentPort.postMessage({ type: 'level', L: lastLevelL, R: lastLevelR });
    }, LEVEL_SEND_MS);
}

// Parse ffmpeg's ametadata output line-by-line. Use per-channel Peak_level
// (instantaneous peak in dBFS) because that's what physical FM tuner VU /
// PPM meters track — RMS sits ~10 dB below peak on broadcast audio.
// Map -40..0 dBFS linearly to 0..1 so a typical peak around -6 dB lands at ~85%.
const DB_MIN = -40;
const DB_MAX = 0;
function dbToBar(dB) {
    if (!Number.isFinite(dB)) return 0;
    const clamped = Math.max(DB_MIN, Math.min(DB_MAX, dB));
    return (clamped - DB_MIN) / (DB_MAX - DB_MIN);
}

function parseMeterLine(line) {
    const m = /lavfi\.astats\.(\d+)\.Peak_level=(-?\d+(?:\.\d+)?|-?inf)/.exec(line);
    if (!m) return;
    const ch = Number(m[1]);
    const raw = m[2];
    const dB = raw === '-inf' ? DB_MIN : Number(raw);
    const v = dbToBar(dB);
    if (ch === 1) lastLevelL = v;
    else if (ch === 2) lastLevelR = v;
    sendLevelsThrottled();
}

function consumeMeterStdout(chunk) {
    stderrLineBuf += chunk.toString();
    let idx;
    while ((idx = stderrLineBuf.indexOf('\n')) !== -1) {
        const line = stderrLineBuf.slice(0, idx);
        stderrLineBuf = stderrLineBuf.slice(idx + 1);
        parseMeterLine(line);
    }
}

function spawnPlayer() {
    try {
        player = spawn('ffplay', playerArgs(), { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) {
        parentPort.postMessage({ type: 'log', source: 'ffplay', text: 'spawn failed: ' + e.message });
        player = null;
        return;
    }
    player.on('error', (err) => parentPort.postMessage({ type: 'log', source: 'ffplay', text: 'error: ' + err.message }));
    player.on('exit', (code, signal) => {
        if (code !== 0 && code !== null) {
            parentPort.postMessage({ type: 'log', source: 'ffplay', text: `exited code=${code} signal=${signal}` });
        }
        player = null;
    });
    if (player.stdout) player.stdout.on('data', () => {});
    if (player.stderr) {
        player.stderr.on('data', (chunk) => {
            const t = chunk.toString().trim();
            if (t) parentPort.postMessage({ type: 'log', source: 'ffplay', text: t });
        });
    }
}

function spawnMeter() {
    try {
        meter = spawn('ffmpeg', meterArgs(), { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) {
        parentPort.postMessage({ type: 'log', source: 'ffmpeg', text: 'spawn failed: ' + e.message });
        meter = null;
        return;
    }
    meter.on('error', (err) => parentPort.postMessage({ type: 'log', source: 'ffmpeg', text: 'error: ' + err.message }));
    meter.on('exit', () => { meter = null; });
    meter.stdout.on('data', consumeMeterStdout);
    meter.stderr.on('data', () => {});
}

function startPlayback() {
    if (!url) return;

    if (!ws || ws.readyState === WebSocket.CLOSED) {
        const wsOptions = userAgent ? { headers: { 'User-Agent': `${userAgent} (audio)` } } : {};
        ws = new WebSocket(url, wsOptions);
        ws.on('open', () => { ws.send(JSON.stringify({ type: 'fallback', data: 'mp3' })); });
        ws.on('message', (data) => {
            const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
            buffer.push(buf);
            bufferedBytes += buf.length;
            flushBuffer();
        });
        ws.on('close', () => { ws = null; });
        ws.on('error', () => { ws = null; });
    }

    if (!player) spawnPlayer();
    if (!meter) spawnMeter();
    if (flushTimer) clearInterval(flushTimer);
    let ticks = 0;
    flushTimer = setInterval(() => {
        flushBuffer(true);
        ticks++;
        // Report every ~2 s (50 ticks × 40 ms) if drops have happened.
        if (ticks >= 50) {
            if (dropsSinceReport > 0) {
                parentPort.postMessage({ type: 'log', source: 'audio', text: `dropped ${dropsSinceReport} bytes in last 2s (pipe saturated)` });
                dropsSinceReport = 0;
            }
            ticks = 0;
        }
    }, FLUSH_INTERVAL_MS);
}

function stopPlayback() {
    if (ws) { try { ws.close(); } catch (e) { /* ignore */ } ws = null; }
    if (player) { try { player.stdin.end(); } catch (e) { /* ignore */ } player = null; }
    if (meter) { try { meter.stdin.end(); } catch (e) { /* ignore */ } meter = null; }
    if (flushTimer) { clearInterval(flushTimer); flushTimer = null; }
    buffer = [];
    bufferedBytes = 0;
    lastLevelL = 0; lastLevelR = 0;
    parentPort.postMessage({ type: 'level', L: 0, R: 0 });
}

parentPort.on('message', (msg) => {
    if (msg.url) { url = msg.url; userAgent = msg.userAgent; }
    else if (msg.type === 'start') startPlayback();
    else if (msg.type === 'stop') stopPlayback();
    else if (msg.type === 'setVolume') {
        volume = Number(msg.value);
        // Restart only ffplay (audio) — the meter ffmpeg keeps running on the same MP3 stream.
        if (player) {
            try { player.stdin.end(); } catch (e) { /* ignore */ }
            player = null;
            if (ws && ws.readyState === WebSocket.OPEN) spawnPlayer();
        }
    }
});
