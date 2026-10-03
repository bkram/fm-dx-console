const DefaultWebSocket = require('ws');
const { spawn: defaultSpawn } = require('node:child_process');

// Resource handles belong to the session that created them. Dependency injection
// lets regression tests drive delayed exits without running ffmpeg or the network.
function createPlayback({ url, userAgent, volume = 100, onMessage,
    WebSocket = DefaultWebSocket, spawn = defaultSpawn }) {
    let socket = null;
    let player = null;
    let meter = null;
    let playing = false;
    let flushTimer = null;
    let reconnectTimer = null;
    let reconnectAttempts = 0;
    let levelTimer = null;
    let chunks = [];
    let bytes = 0;
    let left = 0;
    let right = 0;
    const queueMax = 256 * 1024;
    const log = (source, text) => onMessage({ type: 'log', source, text });

    function closeSocket(current) {
        if (!current) return;
        current.removeAllListeners();
        current.on('error', () => {});
        current.close();
        const timer = setTimeout(() => current.terminate(), 1000);
        timer.unref();
        current.once('close', () => clearTimeout(timer));
    }
    function closeProcess(current) {
        if (!current) return;
        current.stdin.end();
        current.kill();
        const timer = setTimeout(() => current.kill('SIGKILL'), 1000);
        timer.unref();
        current.once('exit', () => clearTimeout(timer));
    }
    function write(current, data) {
        if (!current?.stdin.writable || current.stdin.destroyed) return;
        if (current.stdin.writableLength + data.length > queueMax) return;
        try { current.stdin.write(data); } catch (error) { log('audio', error.message); }
    }
    function flush(force = false) {
        if (!chunks.length || (!force && bytes < 2048)) return;
        const data = Buffer.concat(chunks, bytes);
        chunks = [];
        bytes = 0;
        write(player, data);
        write(meter, data);
    }
    function sendLevels() {
        if (levelTimer) return;
        levelTimer = setTimeout(() => {
            levelTimer = null;
            onMessage({ type: 'level', L: left, R: right });
        }, 80);
    }
    function spawnPlayer() {
        const current = spawn('ffplay', [
            '-loglevel', 'warning', '-nodisp', '-fflags', 'nobuffer',
            '-flags', 'low_delay', '-probesize', '32', '-analyzeduration', '0',
            '-acodec', 'mp3', '-volume', String(volume), '-rtbufsize', '256k',
            '-vn', '-i', 'pipe:0',
        ], { stdio: ['pipe', 'pipe', 'pipe'] });
        player = current;
        const fail = (error) => {
            if (player !== current) return;
            log('ffplay', error.message);
            stop();
        };
        current.on('error', fail);
        current.stdin.on('error', fail);
        current.on('exit', (code) => {
            if (player !== current) return;
            log('ffplay', `exited (${code})`);
            player = null;
            stop();
        });
        current.stdout.on('data', () => {});
        current.stderr.on('data', (data) => { if (player === current) log('ffplay', data.toString().trim()); });
    }
    function spawnMeter() {
        const current = spawn('ffmpeg', [
            '-loglevel', 'quiet', '-fflags', 'nobuffer', '-flags', 'low_delay',
            '-probesize', '32', '-analyzeduration', '0', '-f', 'mp3', '-i', 'pipe:0',
            '-af', 'astats=metadata=1:reset=1,ametadata=mode=print:file=-', '-f', 'null', '-',
        ], { stdio: ['pipe', 'pipe', 'pipe'] });
        meter = current;
        const fail = (error) => {
            if (meter !== current) return;
            log('ffmpeg', error.message);
            meter = null;
            closeProcess(current);
        };
        current.on('error', fail);
        current.stdin.on('error', fail);
        current.on('exit', () => { if (meter === current) meter = null; });
        let lines = '';
        current.stdout.on('data', (data) => {
            if (meter !== current) return;
            lines += data.toString();
            let index;
            while ((index = lines.indexOf('\n')) !== -1) {
                const line = lines.slice(0, index);
                lines = lines.slice(index + 1);
                const match = /lavfi\.astats\.(\d+)\.Peak_level=(-?\d+(?:\.\d+)?|-?inf)/.exec(line);
                if (!match) continue;
                const db = Number(match[2]);
                const level = Number.isFinite(db) ? (Math.max(-40, Math.min(0, db)) + 40) / 40 : 0;
                if (match[1] === '1') left = level;
                else if (match[1] === '2') right = level;
                sendLevels();
            }
        });
        current.stderr.on('data', () => {});
    }
    function openSocket() {
        const options = userAgent ? { headers: { 'User-Agent': `${userAgent} (audio)` } } : {};
        const current = new WebSocket(url, options);
        socket = current;
        current.on('open', () => {
            if (socket !== current || !playing) return;
            reconnectAttempts = 0;
            current.send(JSON.stringify({ type: 'fallback', data: 'mp3' }));
        });
        current.on('message', (data, isBinary) => {
            if (socket !== current || !playing || isBinary === false) return;
            const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data);
            chunks.push(chunk);
            bytes += chunk.length;
            flush();
        });
        current.on('error', (error) => { if (socket === current) log('audio', error.message); });
        current.on('close', () => {
            if (socket !== current) return;
            socket = null;
            if (!playing || reconnectTimer) return;
            const delay = Math.min(30000, 1000 * 2 ** Math.min(reconnectAttempts++, 5));
            reconnectTimer = setTimeout(() => {
                reconnectTimer = null;
                if (playing) openSocket();
            }, delay);
        });
    }
    function start() {
        if (playing || !url) return;
        playing = true;
        try {
            spawnPlayer();
            spawnMeter();
            openSocket();
            flushTimer = setInterval(() => flush(true), 40);
            onMessage({ type: 'audio', playing: true });
        } catch (error) {
            log('audio', error.message);
            stop();
        }
    }
    function stop() {
        playing = false;
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
        reconnectAttempts = 0;
        clearInterval(flushTimer);
        flushTimer = null;
        clearTimeout(levelTimer);
        levelTimer = null;
        const oldSocket = socket;
        const oldPlayer = player;
        const oldMeter = meter;
        socket = player = meter = null;
        closeSocket(oldSocket);
        closeProcess(oldPlayer);
        closeProcess(oldMeter);
        chunks = [];
        bytes = left = right = 0;
        onMessage({ type: 'level', L: 0, R: 0 });
        onMessage({ type: 'audio', playing: false });
    }
    function setVolume(value) {
        if (!Number.isFinite(value)) return;
        const next = Math.max(0, Math.min(100, Math.round(value)));
        if (next === volume) return;
        volume = next;
        if (!playing) return;
        const old = player;
        player = null;
        closeProcess(old);
        try { spawnPlayer(); } catch (error) { log('ffplay', error.message); stop(); }
    }
    return { start, stop, setVolume };
}
module.exports = { createPlayback };
