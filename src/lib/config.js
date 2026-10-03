import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { isValidURL, normalizeUrl } from './urls.js';

export const configPath = path.join(os.homedir(), '.fm-dx-console.json');
export const HISTORY_LIMIT = 25;
const defaults = () => ({ lastUrl: null, signalUnit: 'dBf', recentServers: [] });

export function validateConfig(value) {
    const config = defaults();
    if (!value || typeof value !== 'object' || Array.isArray(value)) return config;
    if (['dBf', 'dBuV', 'dBm'].includes(value.signalUnit)) config.signalUnit = value.signalUnit;
    if (typeof value.lastUrl === 'string' && isValidURL(value.lastUrl)) config.lastUrl = normalizeUrl(value.lastUrl);
    const entries = Array.isArray(value.recentServers) ? value.recentServers : [];
    const seen = new Set();
    for (const entry of entries) {
        if (!entry || typeof entry.url !== 'string' || !isValidURL(entry.url)) continue;
        const url = normalizeUrl(entry.url);
        if (seen.has(url)) continue;
        seen.add(url);
        config.recentServers.push({
            url,
            name: typeof entry.name === 'string' ? entry.name : '',
            connectedAt: Number.isFinite(entry.connectedAt) ? entry.connectedAt : 0,
        });
        if (config.recentServers.length === HISTORY_LIMIT) break;
    }
    // Migrate only legacy configuration; an explicitly empty history stays empty.
    if (!Array.isArray(value.recentServers) && config.lastUrl) {
        config.recentServers.push({ url: config.lastUrl, name: '', connectedAt: 0 });
    }
    return config;
}

export function addRecentServer(config, { url, name = '' }, now = Date.now()) {
    const current = validateConfig(config);
    const canonical = normalizeUrl(url);
    const existing = current.recentServers.find((entry) => entry.url === canonical);
    return {
        ...current,
        lastUrl: canonical,
        recentServers: [
            { url: canonical, name: name || existing?.name || '', connectedAt: now },
            ...current.recentServers.filter((entry) => entry.url !== canonical),
        ].slice(0, HISTORY_LIMIT),
    };
}

// Serialised atomic writes prevent partial JSON and older writes overtaking newer ones.
export function createConfigStore(filename = configPath, onError = () => {}) {
    let pending = null;
    let timer = null;
    let writes = Promise.resolve();
    function load() {
        if (pending) return structuredClone(pending);
        try { return validateConfig(JSON.parse(fs.readFileSync(filename, 'utf8'))); }
        catch { return defaults(); }
    }
    function flush() {
        if (timer) clearTimeout(timer);
        timer = null;
        if (!pending) return writes;
        const snapshot = pending;
        // Keep the pending snapshot readable until this write completes.
        writes = writes.then(async () => {
            const temporary = `${filename}.${process.pid}.tmp`;
            try {
                await fs.promises.writeFile(temporary, JSON.stringify(snapshot, null, 2), { mode: 0o600 });
                await fs.promises.rename(temporary, filename);
            } catch (error) {
                await fs.promises.rm(temporary, { force: true }).catch(() => {});
                onError(error);
            } finally {
                if (pending === snapshot) pending = null;
            }
        });
        return writes;
    }
    function save(partial) {
        pending = validateConfig({ ...load(), ...partial });
        if (!timer) timer = setTimeout(flush, 250);
    }
    function record(server) { save(addRecentServer(load(), server)); }
    function updateName(url, name) {
        const canonical = normalizeUrl(url);
        save({ recentServers: load().recentServers.map((entry) => entry.url === canonical ? { ...entry, name } : entry) });
    }
    return { load, save, flush, record, updateName };
}

const store = createConfigStore(configPath, (error) => process.stderr.write(`Could not save settings: ${error.message}\n`));
export const loadConfig = store.load;
export const saveConfig = store.save;
export const flushConfig = store.flush;
export const recordServer = store.record;
export const updateServerName = store.updateName;
