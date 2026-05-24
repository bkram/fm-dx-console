// Tiny JSON-backed config at ~/.fm-dx-console.json. We persist the few
// things the user expects to survive a relaunch:
//   - lastUrl       : auto-connect to the last server when --url is omitted
//   - signalUnit    : 'dBf' | 'dBuV' | 'dBm'

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CONFIG_PATH = path.join(os.homedir(), '.fm-dx-console.json');

const DEFAULTS = {
    lastUrl: null,
    signalUnit: 'dBf',
};

export function loadConfig() {
    try {
        const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        return { ...DEFAULTS, ...parsed };
    } catch (err) {
        // First run or corrupt file — return defaults silently.
        return { ...DEFAULTS };
    }
}

// Coalesces rapid successive writes so a typing storm (e.g. multiple unit
// cycles) doesn't pummel the disk.
let saveTimer = null;
let pending = null;

export function saveConfig(partial) {
    pending = { ...(pending || loadConfig()), ...partial };
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
        const toWrite = pending;
        pending = null;
        saveTimer = null;
        try {
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(toWrite, null, 2));
        } catch (err) {
            // Non-fatal — just skip persistence.
        }
    }, 250);
}

export const configPath = CONFIG_PATH;
