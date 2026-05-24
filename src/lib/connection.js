// Connection layer for fm-dx-webserver: main /text WS, /rds WS, command
// queue, RDS worker thread, tuner info polling and ping. Exposes a small
// EventEmitter so the Ink UI can subscribe to state changes.

import { EventEmitter } from 'node:events';
import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { getTunerInfo, getPingTime } = require('../../tunerinfo.cjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

const THROTTLE_MS = 125;          // 8 commands / sec
const RDS_REQUEST_MS = 500;
const RDS_PROCESS_MS = 200;
const PING_MS = 5000;

function formatWebSocketURL(url) {
    let u = url;
    if (u.endsWith('/')) u = u.slice(0, -1);
    if (u.startsWith('http://')) u = 'ws://' + u.slice(7);
    else if (u.startsWith('https://')) u = 'wss://' + u.slice(8);
    return u;
}

export function isValidURL(s) {
    try { new URL(s); return true; } catch { return false; }
}

export function normalizeUrl(s) {
    return s.toLowerCase().replace('#', '').replace('?', '');
}

export class Connection extends EventEmitter {
    constructor({ url, userAgent, debug } = {}) {
        super();
        this.userAgent = userAgent || 'fm-dx-console';
        this.debug = !!debug;
        this.url = '';
        this.wsAddr = '';
        this.ws = null;
        this.rdsWs = null;
        this.rdsWorker = null;
        this.audioWorker = null;
        this.audioPlaying = false;
        this.volume = 100;
        this.data = null;            // last jsonData from /text
        this.rdsAdvanced = null;     // last advanced RDS payload
        this.tunerInfo = {
            tunerName: '',
            tunerDesc: '',
            tunerType: '',
            antNames: ['Default'],
            activeAnt: 0,
        };
        this.pingTime = null;
        this.commandQueue = [];
        this._intervals = new Set();
        this._closing = false;

        // Auto-reconnect state
        this._userDisconnected = false;
        this._reconnectAttempts = 0;
        this._reconnectTimer = null;

        // Default error listener — prevents unhandled 'error' throws when
        // the UI hasn't subscribed yet.
        this.on('error', () => {});

        if (url) this.connect(url);
    }

    log(...args) {
        if (this.debug) this.emit('log', args.join(' '));
    }

    _setInterval(fn, ms) {
        const h = setInterval(fn, ms);
        this._intervals.add(h);
        return h;
    }

    _clearInterval(h) {
        if (h) {
            clearInterval(h);
            this._intervals.delete(h);
        }
    }

    connect(url) {
        this.disconnect();
        this._userDisconnected = false;
        this._reconnectAttempts = 0;
        this.url = normalizeUrl(url);
        this.wsAddr = formatWebSocketURL(this.url);
        this.data = null;
        this.rdsAdvanced = null;
        this.tunerInfo = { tunerName: '', tunerDesc: '', tunerType: '', antNames: ['Default'], activeAnt: 0 };
        this.pingTime = null;
        this.emit('connecting', this.url);
        this._openMainWs();
        this._openRdsWs();
        this._startTunerPolling();
        this._startPing();
        this._startCommandPump();
    }

    disconnect() {
        this._userDisconnected = true;
        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }
        this._closing = true;
        try { if (this.ws) this.ws.close(); } catch {}
        try { if (this.rdsWs) this.rdsWs.close(); } catch {}
        if (this.rdsWorker) { try { this.rdsWorker.terminate(); } catch {} this.rdsWorker = null; }
        if (this.audioWorker) { try { this.audioWorker.terminate(); } catch {} this.audioWorker = null; }
        this.audioPlaying = false;
        for (const h of [...this._intervals]) this._clearInterval(h);
        this.ws = null;
        this.rdsWs = null;
        this._closing = false;
    }

    // Restart the WS pair without resetting cached state — used by the
    // auto-reconnect path after an unexpected close.
    _restartSockets() {
        try { if (this.ws) this.ws.close(); } catch {}
        try { if (this.rdsWs) this.rdsWs.close(); } catch {}
        this.ws = null;
        this.rdsWs = null;
        this._openMainWs();
        this._openRdsWs();
    }

    _scheduleReconnect() {
        if (this._userDisconnected) return;
        if (this._reconnectTimer) return;
        this._reconnectAttempts++;
        // Exponential backoff: 1s, 2s, 4s, 8s, 16s, capped at 30s.
        const delayMs = Math.min(30000, 1000 * Math.pow(2, this._reconnectAttempts - 1));
        this.emit('reconnecting', { attempt: this._reconnectAttempts, delayMs });
        this._reconnectTimer = setTimeout(() => {
            this._reconnectTimer = null;
            if (this._userDisconnected) return;
            this._restartSockets();
        }, delayMs);
    }

    enqueue(cmd) {
        this.commandQueue.push(cmd);
    }

    _startCommandPump() {
        this._setInterval(() => {
            if (this.commandQueue.length && this.ws && this.ws.readyState === WebSocket.OPEN) {
                const cmd = this.commandQueue.shift();
                this.log('send', cmd);
                try { this.ws.send(cmd); } catch (e) { this.log('send error:', e.message); }
            }
        }, THROTTLE_MS);
    }

    _openMainWs() {
        const opts = this.userAgent ? { headers: { 'User-Agent': `${this.userAgent} (control)` } } : {};
        const ws = new WebSocket(`${this.wsAddr}/text`, opts);
        this.ws = ws;
        ws.on('open', () => {
            this.log('main ws open');
            this._reconnectAttempts = 0;
            this.emit('open');
        });
        ws.on('message', (raw) => {
            try {
                const j = JSON.parse(raw.toString());
                this.data = j;
                this.emit('data', j);
            } catch (e) {
                this.log('json parse error:', e.message);
            }
        });
        ws.on('error', (err) => { this.log('main ws error:', err.message); this.emit('error', err); });
        ws.on('close', () => {
            this.log('main ws closed');
            this.emit('close');
            this._scheduleReconnect();
        });
    }

    _openRdsWs() {
        // Spawn RDS worker
        const workerPath = path.join(PROJECT_ROOT, 'rds-worker.cjs');
        try {
            this.rdsWorker = new Worker(workerPath);
            this.rdsWorker.on('message', (msg) => {
                if (msg && msg.type === 'data') {
                    this.rdsAdvanced = msg;
                    this.emit('rds-advanced', msg);
                }
            });
            this.rdsWorker.on('error', (err) => this.log('rds worker error:', err.message));
        } catch (err) {
            this.log('rds worker failed:', err.message);
            this.rdsWorker = null;
        }

        const opts = this.userAgent ? { headers: { 'User-Agent': `${this.userAgent} (rds)` } } : {};
        const rds = new WebSocket(`${this.wsAddr}/rds`, opts);
        this.rdsWs = rds;

        let buffer = [];
        let processH = null;
        const requestH = this._setInterval(() => {
            if (this.rdsWorker) this.rdsWorker.postMessage({ type: 'getData' });
        }, RDS_REQUEST_MS);

        rds.on('open', () => this.log('rds ws open'));
        rds.on('message', (raw) => {
            buffer.push(raw.toString());
            if (!processH) {
                processH = this._setInterval(() => {
                    if (buffer.length === 0) return;
                    const msgs = buffer.splice(0, buffer.length);
                    for (const m of msgs) {
                        if (this.rdsWorker) this.rdsWorker.postMessage({ type: 'parse', data: m });
                    }
                }, RDS_PROCESS_MS);
            }
        });
        rds.on('error', (err) => this.log('rds ws error:', err.message));
        rds.on('close', () => {
            this.log('rds ws closed');
            if (processH) this._clearInterval(processH);
            this._clearInterval(requestH);
            if (this.rdsWorker) { try { this.rdsWorker.terminate(); } catch {} this.rdsWorker = null; }
        });
    }

    async _refreshTunerInfo() {
        try {
            const info = await getTunerInfo(this.url);
            this.tunerInfo = {
                tunerName: info.tunerName || '',
                tunerDesc: info.tunerDesc || '',
                tunerType: (info.tunerType || '').toLowerCase(),
                antNames: info.antNames && info.antNames.length ? info.antNames : ['Default'],
                activeAnt: info.activeAnt ?? 0,
            };
            this.emit('tunerinfo', this.tunerInfo);
        } catch (err) {
            this.log('tunerinfo error:', err.message);
        }
    }

    _startTunerPolling() {
        this._refreshTunerInfo();
    }

    async _doPing() {
        try {
            this.pingTime = await getPingTime(this.url);
            this.emit('ping', this.pingTime);
        } catch (err) {
            this.log('ping error:', err.message);
        }
    }

    _startPing() {
        this._doPing();
        this._setInterval(() => this._doPing(), PING_MS);
    }

    refreshTunerInfo() {
        return this._refreshTunerInfo();
    }

    // --- High-level actions ---

    // Wipe everything that depends on which station we're receiving.
    // Sent to the RDS worker (clears its internal accumulator) and applied
    // to our cached snapshot so the UI doesn't show the previous station's
    // PS / RT / PTYN / signal / TX info while we wait for the new data.
    _resetRdsState() {
        if (this.rdsWorker) {
            try { this.rdsWorker.postMessage({ type: 'reset' }); } catch (e) { /* ignore */ }
        }
        this.rdsAdvanced = null;
        this.emit('rds-advanced', null);
        if (this.data) {
            // Broadcast metadata
            this.data.pi = '';
            this.data.ps = '';
            this.data.pty = 0;
            this.data.tp = 0;
            this.data.ta = 0;
            this.data.ms = '';
            this.data.rt0 = '';
            this.data.rt1 = '';
            this.data.af = [];
            // Reception state — comes back fast from the server
            this.data.st = 0;
            this.data.sig = 0;
            // Transmitter info lookup is freq-keyed on the server
            this.data.txInfo = {};
            this.emit('data', this.data);
        }
    }

    tune(freqMHz) {
        this.enqueue(`T${Math.round(freqMHz * 1000)}`);
        this._resetRdsState();
    }

    tuneDelta(deltaKHz) {
        if (!this.data || !this.data.freq) return;
        this.enqueue(`T${(this.data.freq * 1000) + deltaKHz}`);
        this._resetRdsState();
    }

    tuneToCurrent() {
        if (!this.data || !this.data.freq) return;
        this.enqueue(`T${this.data.freq * 1000}`);
        this._resetRdsState();
    }

    setAntenna(idx) {
        this.enqueue(`Z${idx}`);
    }

    cycleAntenna() {
        if (!this.data) return;
        const count = Math.max(this.tunerInfo.antNames.length, 1);
        const cur = parseInt(this.data.ant, 10) || 0;
        const next = (cur + 1) % count;
        this.enqueue(`Z${next}`);
        this.data.ant = next;
        this.emit('data', this.data);
    }

    setBandwidth({ value, value2 }) {
        const legacy = value2 !== undefined ? String(value2) : '';
        this.enqueue(`F${legacy}`);
        this.enqueue(`W${value}`);
        if (this.data) {
            this.data.bw = String(value);
            this.emit('data', this.data);
        }
    }

    setAgc(value) {
        this.enqueue(`A${value}`);
        if (this.data) {
            this.data.agc = String(value);
            this.emit('data', this.data);
        }
    }

    toggleForcedStereo() {
        if (!this.data) return;
        const next = this.data.stForced == '1' ? '0' : '1';
        this.enqueue(`B${next}`);
        this.data.stForced = next;
        this.emit('data', this.data);
    }

    toggleEq() {
        if (!this.data) return;
        const eq = this.data.eq ? 0 : 1;
        const ims = this.data.ims ? 1 : 0;
        this.enqueue(`G${eq}${ims}`);
        this.data.eq = eq;
        this.emit('data', this.data);
    }

    toggleIms() {
        if (!this.data) return;
        const eq = this.data.eq ? 1 : 0;
        const ims = this.data.ims ? 0 : 1;
        this.enqueue(`G${eq}${ims}`);
        this.data.ims = ims;
        this.emit('data', this.data);
    }

    sendRaw(s) {
        if (s) this.enqueue(String(s));
    }

    startAudio() {
        if (this.audioWorker) {
            this.audioWorker.postMessage({ type: 'start' });
            this.audioPlaying = true;
            this.emit('audio', this.audioPlaying);
            return;
        }
        const workerPath = path.join(PROJECT_ROOT, 'audio-worker.cjs');
        try {
            this.audioWorker = new Worker(workerPath, {
                workerData: {
                    url: `${this.wsAddr}/audio`,
                    userAgent: this.userAgent,
                    volume: this.volume,
                },
            });
            this.audioWorker.on('error', (err) => this.log('audio worker error:', err.message));
            this.audioWorker.on('message', (msg) => {
                if (!msg) return;
                if (msg.type === 'level') {
                    this.emit('level', { L: msg.L || 0, R: msg.R || 0 });
                } else if (msg.type === 'log') {
                    this.log(`[audio ${msg.source}]`, msg.text);
                }
            });
            this.audioWorker.on('exit', () => {
                this.audioWorker = null;
                this.audioPlaying = false;
                this.emit('audio', false);
                this.emit('level', { L: 0, R: 0 });
            });
            this.audioWorker.postMessage({ type: 'start' });
            this.audioPlaying = true;
            this.emit('audio', true);
        } catch (err) {
            this.log('audio worker failed to start:', err.message);
        }
    }

    stopAudio() {
        if (this.audioWorker) this.audioWorker.postMessage({ type: 'stop' });
        this.audioPlaying = false;
        this.emit('audio', false);
    }

    toggleAudio() {
        if (this.audioPlaying) this.stopAudio();
        else this.startAudio();
    }

    setVolume(v) {
        const clamped = Math.max(0, Math.min(100, Math.round(v)));
        if (clamped === this.volume) return;
        this.volume = clamped;
        if (this.audioWorker) {
            this.audioWorker.postMessage({ type: 'setVolume', value: clamped });
        }
        this.emit('volume', clamped);
    }

    changeVolume(delta) {
        this.setVolume(this.volume + delta);
    }
}
