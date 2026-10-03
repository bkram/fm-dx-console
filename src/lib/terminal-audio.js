import { EventEmitter } from 'node:events';
import { Worker } from 'node:worker_threads';
import { clampVolume } from './display.js';

// Node audio output adapter; the receiver only provides its current audio URL.
export class TerminalAudio extends EventEmitter {
    constructor({ getUrl, userAgent, debug = false, WorkerType = Worker }) {
        super();
        this.getUrl = getUrl;
        this.WorkerType = WorkerType;
        this.userAgent = userAgent;
        this.debug = debug;
        this.audioWorker = null;
        this.audioPlaying = false;
        this.volume = 100;
    }
    log(...args) { if (this.debug) this.emit('log', args.join(' ')); }
    shutdown() {
        const worker = this.audioWorker;
        this.audioWorker = null;
        this.audioPlaying = false;
        if (!worker) return;
        worker.postMessage({ type: 'shutdown' });
        const deadline = setTimeout(() => worker.terminate().catch(() => {}), 2000);
        deadline.unref();
        worker.once('exit', () => clearTimeout(deadline));
    }

    startAudio() {
        const url = this.getUrl();
        if (!url) return;
        if (this.audioWorker) {
            this.audioWorker.postMessage({ type: 'start' });
            this.audioPlaying = true;
            this.emit('audio', this.audioPlaying);
            return;
        }
        const workerPath = new URL('../workers/audio.cjs', import.meta.url);
        try {
            const worker = new this.WorkerType(workerPath, {
                workerData: {
                    url,
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
        const clamped = clampVolume(v);
        if (clamped === null) return;
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
