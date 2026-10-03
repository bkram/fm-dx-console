// Connection layer for fm-dx-webserver: main /text WS, /rds WS, command
// queue, RDS worker thread, tuner info polling and ping. Exposes a small
// EventEmitter so the Ink UI can subscribe to state changes.

import { EventEmitter } from 'node:events';
import { Worker } from 'node:worker_threads';
import WebSocket from 'ws';
import { createRequire } from 'node:module';
import { normalizeUrl, endpointUrl } from './urls.js';
export { normalizeUrl, isValidURL } from './urls.js';

const require = createRequire(import.meta.url);
const { getTunerInfo, getPingTime } = require('../shared/tunerinfo.cjs');

const THROTTLE_MS = 125;          // 8 commands / sec
const RDS_REQUEST_MS = 500;
const RDS_PROCESS_MS = 200;
const PING_MS = 5000;

function closeSocket(socket) {
    if (!socket) return;
    socket.removeAllListeners();
    // close() on a CONNECTING socket emits its error asynchronously.
    socket.on('error', () => {});
    socket.close();
    const deadline = setTimeout(() => socket.terminate(), 1000);
    deadline.unref();
    socket.once('close', () => clearTimeout(deadline));
}

export class Connection extends EventEmitter {
    constructor({ url, userAgent, debug } = {}) {
        super();
        this.userAgent = userAgent || 'fm-dx-console';
        this.debug = !!debug;
        this.url = '';
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
        this._session = 0;
        this._requests = null;
        this._pingInFlight = null;

        // Auto-reconnect state
        this._userDisconnected = false;
        this._reconnectAttempts = 0;
        this._reconnectTimer = null;
        this._rdsReconnectTimer = null;
        this._rdsReconnectAttempts = 0;
        this._rdsRequestH = null;
        this._rdsProcessH = null;

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
        const canonical = normalizeUrl(url);
        this.disconnect();
        this._requests = new AbortController();
        this._userDisconnected = false;
        this._reconnectAttempts = 0;
        this._rdsReconnectAttempts = 0;
        this._lastDataRaw = null;
        this._lastRdsSig = null;
        this.url = canonical;
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
        this._session++;
        this._requests?.abort();
        this._requests = null;
        this._pingInFlight = null;
        this.commandQueue.length = 0;
        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }
        this._teardownMain();
        this._teardownRds();
        if (this.audioWorker) {
            const worker = this.audioWorker;
            this.audioWorker = null;
            worker.postMessage({ type: 'shutdown' });
            const deadline = setTimeout(() => { worker.terminate().catch(() => {}); }, 2000);
            deadline.unref();
            worker.once('exit', () => clearTimeout(deadline));
        }
        this.audioPlaying = false;
        for (const h of [...this._intervals]) this._clearInterval(h);
    }

    _teardownMain() {
        const socket = this.ws;
        this.ws = null;
        closeSocket(socket);
    }

    _teardownRds() {
        if (this._rdsReconnectTimer) clearTimeout(this._rdsReconnectTimer);
        this._rdsReconnectTimer = null;
        this._clearInterval(this._rdsRequestH);
        this._clearInterval(this._rdsProcessH);
        this._rdsRequestH = this._rdsProcessH = null;
        const socket = this.rdsWs;
        this.rdsWs = null;
        closeSocket(socket);
        const worker = this.rdsWorker;
        this.rdsWorker = null;
        if (worker) {
            worker.removeAllListeners();
            worker.on('error', () => {});
            worker.terminate().catch(() => {});
        }
    }

    _scheduleRdsReconnect() {
        if (this._userDisconnected || this._rdsReconnectTimer) return;
        this._rdsReconnectAttempts++;
        const delay = Math.min(30000, 1000 * 2 ** Math.min(this._rdsReconnectAttempts - 1, 5));
        this._rdsReconnectTimer = setTimeout(() => {
            this._rdsReconnectTimer = null;
            if (!this._userDisconnected) this._openRdsWs();
        }, delay);
    }

    // Restart the WS pair without resetting cached state — used by the
    // auto-reconnect path after an unexpected close.
    _restartSockets() {
        this._teardownMain();
        this._teardownRds();
        this._openMainWs();
        this._openRdsWs();
    }

    _scheduleReconnect() {
        if (this._userDisconnected) return;
        if (this._reconnectTimer) return;
        this._reconnectAttempts++;
        // Exponential backoff: 1s, 2s, 4s, 8s, 16s, capped at 30s.
        const delayMs = Math.min(30000, 1000 * Math.pow(2, Math.min(this._reconnectAttempts - 1, 5)));
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
        const ws = new WebSocket(endpointUrl(this.url, 'text', true), opts);
        this.ws = ws;
        this._lastDataRaw = null;
        ws.on('open', () => {
            this.log('main ws open');
            this._reconnectAttempts = 0;
            this.emit('open');
        });
        ws.on('message', (raw) => {
            try {
                const text = raw.toString();
                // Skip identical-payload re-renders. The server pushes the
                // full snapshot on every tick whether anything changed or
                // not; comparing the raw string is much cheaper than letting
                // React re-render the whole tree.
                if (text === this._lastDataRaw) return;
                const j = JSON.parse(text);
                if (!j || typeof j !== 'object' || Array.isArray(j)) return;
                this._lastDataRaw = text;
                this.data = j;
                this.emit('data', j);
            } catch (e) {
                this.log('json parse error:', e.message);
            }
        });
        ws.on('error', (err) => { this.log('main ws error:', err.message); this.emit('error', err); });
        ws.on('close', () => {
            this.log('main ws closed');
            this._teardownRds();
            this.emit('close');
            this._scheduleReconnect();
        });
    }

    _openRdsWs() {
        this._lastRdsSig = null;
        const onFailure = () => {
            this._teardownRds();
            this.rdsAdvanced = null;
            this.emit('rds-advanced', null);
            this._scheduleRdsReconnect();
        };
        // Spawn RDS worker
        const workerPath = new URL('../workers/rds.cjs', import.meta.url);
        try {
            const worker = new Worker(workerPath);
            this.rdsWorker = worker;
            worker.on('message', (msg) => {
                if (this.rdsWorker !== worker) return;
                if (msg && msg.type === 'data') {
                    // Same-payload skip — the worker polls getData every
                    // 500 ms even on stations that aren't sending any new
                    // RDS bits, which otherwise re-renders the UI for
                    // nothing.
                    const sig = JSON.stringify(msg);
                    if (sig === this._lastRdsSig) return;
                    this._lastRdsSig = sig;
                    this.rdsAdvanced = msg;
                    this.emit('rds-advanced', msg);
                }
            });
            worker.on('error', (err) => {
                this.log('rds worker error:', err.message);
                if (this.rdsWorker === worker) onFailure();
            });
            worker.on('exit', () => { if (this.rdsWorker === worker) onFailure(); });
        } catch (err) {
            this.log('rds worker failed:', err.message);
            this.rdsWorker = null;
        }

        const opts = this.userAgent ? { headers: { 'User-Agent': `${this.userAgent} (rds)` } } : {};
        const rds = new WebSocket(endpointUrl(this.url, 'rds', true), opts);
        this.rdsWs = rds;

        const buffer = [];
        this._rdsProcessH = null;
        this._rdsRequestH = this._setInterval(() => {
            if (this.rdsWorker) this.rdsWorker.postMessage({ type: 'getData' });
        }, RDS_REQUEST_MS);

        rds.on('open', () => {
            this._rdsReconnectAttempts = 0;
            this.log('rds ws open');
        });
        rds.on('message', (raw) => {
            buffer.push(raw.toString());
            if (!this._rdsProcessH) {
                this._rdsProcessH = this._setInterval(() => {
                    if (buffer.length === 0) return;
                    const msgs = buffer.splice(0, buffer.length);
                    for (const m of msgs) {
                        if (this.rdsWorker) this.rdsWorker.postMessage({ type: 'parse', data: m });
                    }
                }, RDS_PROCESS_MS);
            }
        });
        rds.on('error', (err) => this.log('rds ws error:', err.message));
        rds.on('close', () => { if (this.rdsWs === rds) onFailure(); });
    }

    async _refreshTunerInfo() {
        const session = this._session;
        try {
            const info = await getTunerInfo(this.url, { signal: this._requests?.signal });
            if (session !== this._session || this._userDisconnected) return;
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
        if (this._pingInFlight !== null) return;
        const session = this._session;
        this._pingInFlight = session;
        try {
            const ping = await getPingTime(this.url, { signal: this._requests?.signal });
            if (session !== this._session || this._userDisconnected) return;
            this.pingTime = ping;
            this.emit('ping', ping);
        } catch (err) {
            this.log('ping error:', err.message);
        } finally {
            if (this._pingInFlight === session) this._pingInFlight = null;
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
        this._lastRdsSig = null;
        this._lastDataRaw = null;
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
        if (!Number.isFinite(freqMHz) || freqMHz < 64 || freqMHz > 108) return;
        this.enqueue(`T${Math.round(freqMHz * 1000)}`);
        this._resetRdsState();
    }

    tuneDelta(deltaKHz) {
        if (!this.data || !this.data.freq) return;
        this.enqueue(`T${Math.round(this.data.freq * 1000) + deltaKHz}`);
        this._resetRdsState();
    }

    tuneToCurrent() {
        if (!this.data || !this.data.freq) return;
        this.enqueue(`T${Math.round(this.data.freq * 1000)}`);
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
        if (this._userDisconnected || !this.url) return;
        if (this.audioWorker) {
            this.audioWorker.postMessage({ type: 'start' });
            this.audioPlaying = true;
            this.emit('audio', this.audioPlaying);
            return;
        }
        const workerPath = new URL('../workers/audio.cjs', import.meta.url);
        try {
            const worker = new Worker(workerPath, {
                workerData: {
                    url: endpointUrl(this.url, 'audio', true),
                    userAgent: this.userAgent,
                    volume: this.volume,
                },
            });
            this.audioWorker = worker;
            worker.on('error', (err) => this.log('audio worker error:', err.message));
            worker.on('message', (msg) => {
                if (this.audioWorker !== worker || !msg) return;
                if (msg.type === 'level') {
                    this.emit('level', { L: msg.L || 0, R: msg.R || 0 });
                } else if (msg.type === 'audio') {
                    this.audioPlaying = !!msg.playing;
                    this.emit('audio', this.audioPlaying);
                } else if (msg.type === 'log') {
                    this.log(`[audio ${msg.source}]`, msg.text);
                }
            });
            worker.on('exit', () => {
                if (this.audioWorker !== worker) return;
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
        if (!Number.isFinite(v)) return;
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
