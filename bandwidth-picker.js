// Bandwidth selector for fm-dx-console.
// Mirrors the fm-dx-webserver dropdown: sends F<legacyValue> then W<value>
// against the appropriate tuner profile.

const blessed = require('blessed');

const TUNER_PROFILES = {
    tef: [
        { value: 0, label: 'Auto' },
        { value: 56000, label: '56 kHz' },
        { value: 64000, label: '64 kHz' },
        { value: 72000, label: '72 kHz' },
        { value: 84000, label: '84 kHz' },
        { value: 97000, label: '97 kHz' },
        { value: 114000, label: '114 kHz' },
        { value: 133000, label: '133 kHz' },
        { value: 151000, label: '151 kHz' },
        { value: 184000, label: '184 kHz' },
        { value: 200000, label: '200 kHz' },
        { value: 217000, label: '217 kHz' },
        { value: 236000, label: '236 kHz' },
        { value: 254000, label: '254 kHz' },
        { value: 287000, label: '287 kHz' },
        { value: 311000, label: '311 kHz' },
    ],
    xdr: [
        { value: 0, value2: -1, label: 'Auto' },
        { value: 55000, value2: 0, label: '55 kHz' },
        { value: 73000, value2: 1, label: '73 kHz' },
        { value: 90000, value2: 2, label: '90 kHz' },
        { value: 108000, value2: 3, label: '108 kHz' },
        { value: 125000, value2: 4, label: '125 kHz' },
        { value: 142000, value2: 5, label: '142 kHz' },
        { value: 159000, value2: 6, label: '159 kHz' },
        { value: 177000, value2: 7, label: '177 kHz' },
        { value: 194000, value2: 8, label: '194 kHz' },
        { value: 211000, value2: 9, label: '211 kHz' },
        { value: 229000, value2: 10, label: '229 kHz' },
        { value: 246000, value2: 11, label: '246 kHz' },
        { value: 263000, value2: 12, label: '263 kHz' },
        { value: 281000, value2: 13, label: '281 kHz' },
        { value: 298000, value2: 14, label: '298 kHz' },
        { value: 309000, value2: 15, label: '309 kHz' },
    ],
    sdr: [
        { value: 0, label: 'Auto' },
        { value: 4000, label: '4 kHz' },
        { value: 8000, label: '8 kHz' },
        { value: 10000, label: '10 kHz' },
        { value: 20000, label: '20 kHz' },
        { value: 30000, label: '30 kHz' },
        { value: 50000, label: '50 kHz' },
        { value: 75000, label: '75 kHz' },
        { value: 100000, label: '100 kHz' },
        { value: 125000, label: '125 kHz' },
        { value: 150000, label: '150 kHz' },
        { value: 175000, label: '175 kHz' },
        { value: 200000, label: '200 kHz' },
        { value: 225000, label: '225 kHz' },
    ],
    si47xx: [
        { value: 0, label: 'Auto' },
        { value: 40000, label: '40 kHz' },
        { value: 60000, label: '60 kHz' },
        { value: 84000, label: '84 kHz' },
        { value: 110000, label: '110 kHz' },
    ],
};

function profileFor(tunerType) {
    const key = (tunerType || '').toString().toLowerCase();
    return TUNER_PROFILES[key] || TUNER_PROFILES.tef;
}

// Open the bandwidth picker as a modal on the given screen.
//   options:
//     screen      — host blessed screen (required)
//     tunerType   — 'tef' | 'xdr' | 'sdr' | 'si47xx'; falls back to 'tef'
//     currentBw   — current jsonData.bw, used to preselect a row
// Resolves with { value, value2 } on selection, or null on cancel.
function pickBandwidth({ screen, tunerType, currentBw } = {}) {
    return new Promise((resolve) => {
        if (!screen) {
            resolve(null);
            return;
        }
        const options = profileFor(tunerType);
        const items = options.map((o) => o.label);

        const prevFocus = screen.focused;
        const widgets = [];
        const screenKeys = [];

        const overlay = blessed.box({
            parent: screen,
            top: 'center',
            left: 'center',
            width: 32,
            height: Math.min(options.length + 4, 22),
            border: 'line',
            label: ` Bandwidth (${(tunerType || 'tef').toLowerCase()}) `,
            style: { border: { fg: 'green' }, bg: 'blue', fg: 'white' },
            shadow: true,
            tags: true,
        });
        widgets.push(overlay);

        const list = blessed.list({
            parent: overlay,
            top: 0,
            left: 0,
            right: 0,
            bottom: 1,
            keys: true,
            mouse: true,
            vi: false,
            style: {
                bg: 'blue',
                selected: { bg: 'green', fg: 'black', bold: true },
                item: { fg: 'white' },
            },
            items,
        });
        widgets.push(list);

        const hint = blessed.box({
            parent: overlay,
            bottom: 0,
            left: 0,
            right: 0,
            height: 1,
            style: { fg: 'black', bg: 'green' },
            content: ' Enter=apply  Esc=cancel ',
        });
        widgets.push(hint);

        // Preselect current bw if it matches
        const bwNum = Number(currentBw);
        if (!Number.isNaN(bwNum)) {
            const idx = options.findIndex((o) => o.value === bwNum);
            if (idx >= 0) list.select(idx);
        }

        function cleanup() {
            for (const k of screenKeys) {
                try { screen.unkey(k.keys, k.fn); } catch (e) { /* ignore */ }
            }
            for (const w of widgets) {
                try { w.detach(); } catch (e) { /* ignore */ }
                try { w.destroy(); } catch (e) { /* ignore */ }
            }
            if (prevFocus) { try { prevFocus.focus(); } catch (e) { /* ignore */ } }
            screen.render();
        }

        function done(value) {
            cleanup();
            resolve(value);
        }

        list.on('select', () => {
            const idx = list.selected;
            const opt = options[idx];
            if (!opt) return done(null);
            done({ value: opt.value, value2: opt.value2 });
        });

        const onCancel = () => done(null);
        screen.key(['escape', 'C-c'], onCancel);
        screenKeys.push({ keys: ['escape', 'C-c'], fn: onCancel });

        list.focus();
        screen.render();
    });
}

// AGC selector — fm-dx-webserver currently only exposes this for Si47xx,
// but we let the user open it regardless and send the command anyway.
const AGC_OPTIONS = [
    { value: 0, label: 'Auto AGC' },
    { value: 1, label: 'High' },
    { value: 3, label: 'Medium' },
    { value: 2, label: 'Low' },
];

function pickAgc({ screen, currentAgc } = {}) {
    return new Promise((resolve) => {
        if (!screen) {
            resolve(null);
            return;
        }
        const items = AGC_OPTIONS.map((o) => o.label);
        const prevFocus = screen.focused;
        const widgets = [];
        const screenKeys = [];

        const overlay = blessed.box({
            parent: screen,
            top: 'center',
            left: 'center',
            width: 28,
            height: AGC_OPTIONS.length + 4,
            border: 'line',
            label: ' AGC ',
            style: { border: { fg: 'green' }, bg: 'blue', fg: 'white' },
            shadow: true,
        });
        widgets.push(overlay);

        const list = blessed.list({
            parent: overlay,
            top: 0,
            left: 0,
            right: 0,
            bottom: 1,
            keys: true,
            mouse: true,
            style: {
                bg: 'blue',
                selected: { bg: 'green', fg: 'black', bold: true },
                item: { fg: 'white' },
            },
            items,
        });
        widgets.push(list);

        const hint = blessed.box({
            parent: overlay,
            bottom: 0,
            left: 0,
            right: 0,
            height: 1,
            style: { fg: 'black', bg: 'green' },
            content: ' Enter=apply  Esc=cancel ',
        });
        widgets.push(hint);

        const agcNum = Number(currentAgc);
        if (!Number.isNaN(agcNum)) {
            const idx = AGC_OPTIONS.findIndex((o) => o.value === agcNum);
            if (idx >= 0) list.select(idx);
        }

        function cleanup() {
            for (const k of screenKeys) {
                try { screen.unkey(k.keys, k.fn); } catch (e) { /* ignore */ }
            }
            for (const w of widgets) {
                try { w.detach(); } catch (e) { /* ignore */ }
                try { w.destroy(); } catch (e) { /* ignore */ }
            }
            if (prevFocus) { try { prevFocus.focus(); } catch (e) { /* ignore */ } }
            screen.render();
        }
        function done(value) { cleanup(); resolve(value); }

        list.on('select', () => {
            const opt = AGC_OPTIONS[list.selected];
            done(opt ? opt.value : null);
        });

        const onCancel = () => done(null);
        screen.key(['escape', 'C-c'], onCancel);
        screenKeys.push({ keys: ['escape', 'C-c'], fn: onCancel });

        list.focus();
        screen.render();
    });
}

module.exports = { pickBandwidth, pickAgc, TUNER_PROFILES, profileFor, AGC_OPTIONS };
