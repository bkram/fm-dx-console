import WebSocket from 'ws';
import axios from 'axios';
import { Connection } from './connection.js';
import { normalizeUrl, endpointUrl } from './urls.js';
import { parseFrequency } from './frequency.js';
import { bandwidthProfile, AGC_OPTIONS } from './profiles.js';
import { defaultSettings } from './config.js';

// Application behavior shared by the terminal and desktop presentations.
// Connection owns transport and workers; Receiver adds history, validated
// actions and the optional spectrum plugin without depending on either UI.
export class Receiver extends Connection {
    constructor({ settings = defaultSettings, spectrum = false, url, ...options } = {}) {
        super(options);
        this.settings = settings;
        this.spectrumEnabled = spectrum;
        this.connected = false;
        this.recorded = false;
        this.plugin = null;
        this.pluginRetry = null;
        this.spectrumRequests = null;
        this.epoch = 0;
        this.on('open', () => {
            this.connected = true;
            if (!this.recorded) {
                settings.record({ url: this.url, name: this.tunerInfo.tunerName });
                this.recorded = true;
                this.emit('settings', settings.load());
            }
        });
        this.on('tunerinfo', info => {
            if (this.connected && info.tunerName) {
                settings.updateName(this.url, info.tunerName);
                this.emit('settings', settings.load());
            }
        });
        this.on('close', () => { this.connected = false; });
        if (url) this.connect(url);
    }

    connect(value) {
        const url = normalizeUrl(value); // Validate before closing a working session.
        super.connect(url);
        this.spectrumRequests = new AbortController();
        if (this.spectrumEnabled) this.openPlugin();
        return url;
    }

    disconnect() {
        this.epoch++;
        this.spectrumRequests?.abort();
        this.spectrumRequests = null;
        this.connected = this.recorded = false;
        clearTimeout(this.pluginRetry);
        this.pluginRetry = null;
        const old = this.plugin;
        this.plugin = null;
        if (old) {
            old.removeAllListeners();
            old.on('error', () => {});
            old.close();
            const timer = setTimeout(() => old.terminate(), 1000);
            timer.unref();
            old.once('close', () => clearTimeout(timer));
        }
        super.disconnect();
        this.url = '';
        this.emit('disconnected');
    }

    openPlugin() {
        if (!this.spectrumRequests) return;
        const current = new WebSocket(endpointUrl(this.url, 'data_plugins', true));
        this.plugin = current;
        current.on('error', () => {}); // Spectrum plugin is optional.
        current.on('close', () => {
            if (this.plugin !== current || !this.spectrumRequests) return;
            this.plugin = null;
            this.pluginRetry = setTimeout(() => { this.pluginRetry = null; this.openPlugin(); }, 3000);
            this.pluginRetry.unref();
        });
    }

    audioUrl() { return !this._userDisconnected && this.url ? endpointUrl(this.url, 'audio', true) : null; }

    async spectrum() {
        if (!this.spectrumRequests) return null;
        const epoch = this.epoch;
        try {
            const response = await axios.get(endpointUrl(this.url, 'spectrum-graph-plugin'), {
                signal: this.spectrumRequests.signal, timeout: 4000,
                headers: { 'X-Plugin-Name': 'SpectrumGraphPlugin', 'Cache-Control': 'no-cache' },
            });
            return epoch === this.epoch ? response.data : null;
        } catch { return null; }
    }

    scanSpectrum() {
        if (this.plugin?.readyState !== WebSocket.OPEN) throw new Error('Spectrum plugin is not connected');
        this.plugin.send(JSON.stringify({ type: 'spectrum-graph', action: 'scan', value: { status: 'scan' } }));
    }

    action(type, value) {
        if (!this.connected) throw new Error('Connect to a server first');
        switch (type) {
            case 'tune': {
                const frequency = parseFrequency(value);
                if (frequency === null) throw new Error('Enter a frequency between 64 and 108 MHz');
                this.tune(frequency); break;
            }
            case 'tune-delta':
                if (!Number.isFinite(value) || Math.abs(value) > 1000) throw new Error('Invalid tuning step');
                this.tuneDelta(value); break;
            case 'retune': this.tuneToCurrent(); break;
            case 'bandwidth': {
                const option = bandwidthProfile(this.tunerInfo.tunerType).find(item => item.value === Number(value));
                if (!option) throw new Error('Invalid bandwidth');
                this.setBandwidth(option); break;
            }
            case 'agc':
                if (!AGC_OPTIONS.some(item => item.value === Number(value))) throw new Error('Invalid AGC');
                this.setAgc(Number(value)); break;
            case 'stereo': this.toggleForcedStereo(); break;
            case 'ims': this.toggleIms(); break;
            case 'eq': this.toggleEq(); break;
            case 'antenna': this.cycleAntenna(); break;
            case 'raw':
                if (typeof value !== 'string' || !value.trim() || value.length > 1024) throw new Error('Invalid command');
                this.sendRaw(value); break;
            default: throw new Error('Unknown tuner action');
        }
    }
}
