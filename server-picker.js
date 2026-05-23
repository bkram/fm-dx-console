// (c) Bkram 2024
// Interactive picker for the public FM-DX server directory at
// https://servers.fmdx.org/api/

const axios = require('axios');
const blessed = require('blessed');

const SERVER_LIST_URL = 'https://servers.fmdx.org/api/';
const FETCH_TIMEOUT_MS = 10000;

function normalize(s) {
    return (s || '').toString().toLowerCase();
}

function formatRow(entry) {
    const country = (entry.country || '??').toUpperCase().padEnd(2, ' ');
    const name = entry.name || '(unnamed)';
    const city = entry.city ? ` — ${entry.city}` : '';
    const version = entry.version ? `  v${entry.version}` : '';
    const offline = entry.status !== 1 ? '  [offline]' : '';
    return `${country}  ${name}${city}${version}${offline}`;
}

function sortEntries(list) {
    return list.slice().sort((a, b) => {
        const ca = normalize(a.countryName || a.country);
        const cb = normalize(b.countryName || b.country);
        if (ca !== cb) return ca < cb ? -1 : 1;
        return normalize(a.name) < normalize(b.name) ? -1 : 1;
    });
}

// Score a single entry against a normalized query. Higher = better match.
// Returns -1 if no match. Used to rank results so the top hit is the
// "predicted" pick when the user just hits Enter.
function scoreEntry(entry, q) {
    if (!q) return 0;
    const name = normalize(entry.name);
    const city = normalize(entry.city);
    const country = normalize(entry.countryName);
    const code = normalize(entry.country);

    let best = -1;
    const consider = (haystack, weight) => {
        if (!haystack) return;
        if (haystack === q) best = Math.max(best, weight + 1000);
        else if (haystack.startsWith(q)) best = Math.max(best, weight + 500);
        else {
            const i = haystack.indexOf(q);
            if (i !== -1) best = Math.max(best, weight + 100 - Math.min(i, 99));
        }
    };
    consider(name, 40);
    consider(city, 20);
    consider(country, 10);
    consider(code, 30);
    return best;
}

async function fetchServers({ userAgent } = {}) {
    const headers = userAgent ? { 'User-Agent': userAgent } : {};
    const res = await axios.get(SERVER_LIST_URL, {
        headers,
        timeout: FETCH_TIMEOUT_MS,
    });
    if (!res.data || !Array.isArray(res.data.dataset)) {
        throw new Error('Unexpected response shape from server directory');
    }
    return res.data.dataset.filter((e) => e && typeof e.url === 'string' && e.url);
}

// Open the server picker.
//   { userAgent }       — HTTP UA string for the directory fetch
//   { screen }          — when provided, the picker attaches its widgets to
//                         this screen as a modal overlay and detaches them on
//                         close (no screen.destroy). When omitted, the picker
//                         creates and destroys its own screen.
// Resolves with the selected server URL (string) or null on cancel.
function pickServer({ userAgent, screen: hostScreen } = {}) {
    return new Promise((resolve, reject) => {
        const isModal = !!hostScreen;
        const screen = hostScreen || blessed.screen({
            smartCSR: true,
            mouse: true,
            fullUnicode: true,
            title: 'FM-DX server picker',
        });

        let onlineOnly = true;
        let filterText = '';
        let view = [];
        let all = null;
        let caretTimer = null;
        const widgets = [];
        const screenListeners = [];
        const screenKeys = [];
        let prevFocus = isModal ? screen.focused : null;

        // Fullscreen background so widgets beneath are visually covered in modal mode.
        const bg = blessed.box({
            parent: screen,
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            style: { bg: 'blue' },
        });
        widgets.push(bg);

        const title = blessed.box({
            parent: screen,
            top: 0,
            left: 0,
            width: '100%',
            height: 1,
            style: { fg: 'black', bg: 'green', bold: true },
            tags: true,
            content: ' Public FM-DX servers — fetching… ',
        });
        widgets.push(title);

        const search = blessed.box({
            parent: screen,
            top: 1,
            left: 0,
            width: '100%',
            height: 3,
            border: 'line',
            label: ' Search ',
            style: { border: { fg: 'green' }, bg: 'blue', fg: 'white' },
            tags: true,
            content: '',
        });
        widgets.push(search);

        const list = blessed.list({
            parent: screen,
            top: 4,
            left: 0,
            width: '100%',
            bottom: 1,
            keys: true,
            mouse: true,
            vi: false,
            border: 'line',
            style: {
                border: { fg: 'green' },
                bg: 'blue',
                selected: { bg: 'green', fg: 'black', bold: true },
                item: { fg: 'white' },
            },
            items: [],
        });
        widgets.push(list);

        const footer = blessed.box({
            parent: screen,
            bottom: 0,
            left: 0,
            width: '100%',
            height: 1,
            style: { fg: 'black', bg: 'green' },
            tags: true,
            content:
                ' Enter=connect  ↑/↓=move  type=filter  Bksp=del  ^U=clear  Tab=toggle offline  Esc=cancel ',
        });
        widgets.push(footer);

        function renderSearch(caretOn) {
            const caret = caretOn ? '{inverse} {/inverse}' : ' ';
            const shown = filterText.length
                ? `{yellow-fg}${blessed.escape(filterText)}{/yellow-fg}${caret}`
                : `${caret}{gray-fg}type to filter by name / city / country…{/gray-fg}`;
            search.setContent(' ' + shown);
        }

        let caretOn = true;
        function tickCaret() {
            caretOn = !caretOn;
            renderSearch(caretOn);
            screen.render();
        }

        function refresh() {
            if (!all) return;
            const needle = normalize(filterText);
            const pool = all.filter((e) => !(onlineOnly && e.status !== 1));
            if (!needle) {
                view = sortEntries(pool);
            } else {
                const scored = [];
                for (const e of pool) {
                    const s = scoreEntry(e, needle);
                    if (s >= 0) scored.push({ e, s });
                }
                scored.sort((a, b) => b.s - a.s);
                view = scored.map((x) => x.e);
            }
            list.setItems(view.map(formatRow));
            list.select(0);
            title.setContent(
                ` Public FM-DX servers — ${view.length} shown of ${all.length} total` +
                    `   ·   ${onlineOnly ? 'online only' : 'all (incl. offline)'} `,
            );
            renderSearch(caretOn);
            screen.render();
        }

        function cleanup() {
            if (caretTimer) {
                clearInterval(caretTimer);
                caretTimer = null;
            }
            for (const [event, fn] of screenListeners) screen.removeListener(event, fn);
            for (const k of screenKeys) {
                try { screen.unkey(k.keys, k.fn); } catch (e) { /* ignore */ }
            }
            for (const w of widgets) {
                try { w.detach(); } catch (e) { /* ignore */ }
                try { w.destroy(); } catch (e) { /* ignore */ }
            }
            if (isModal) {
                if (prevFocus) { try { prevFocus.focus(); } catch (e) { /* ignore */ } }
                screen.render();
            } else {
                screen.destroy();
            }
        }

        function done(value) {
            cleanup();
            resolve(value);
        }

        list.on('select', () => {
            const idx = list.selected;
            const picked = view[idx];
            if (picked) done(picked.url);
        });

        const onCancel = () => done(null);
        screen.key(['escape', 'C-c'], onCancel);
        screenKeys.push({ keys: ['escape', 'C-c'], fn: onCancel });

        const onTab = () => {
            if (!all) return;
            onlineOnly = !onlineOnly;
            refresh();
        };
        screen.key('tab', onTab);
        screenKeys.push({ keys: 'tab', fn: onTab });

        const onClear = () => {
            if (filterText.length === 0) return;
            filterText = '';
            refresh();
        };
        screen.key('C-u', onClear);
        screenKeys.push({ keys: 'C-u', fn: onClear });

        const onKeypress = (ch, key) => {
            if (!key) return;
            if (screen.focused !== list) return; // only consume keys when our list is focused
            if (key.name === 'backspace') {
                if (filterText.length > 0) {
                    filterText = filterText.slice(0, -1);
                    refresh();
                }
                return;
            }
            if (key.ctrl || key.meta) return;
            if (key.name === 'tab' || key.name === 'enter' || key.name === 'return') return;
            if (key.name === 'up' || key.name === 'down' ||
                key.name === 'left' || key.name === 'right' ||
                key.name === 'pageup' || key.name === 'pagedown' ||
                key.name === 'home' || key.name === 'end') return;
            if (ch && ch.length === 1 && ch >= ' ' && ch !== '\r' && ch !== '\n') {
                filterText += ch;
                refresh();
            }
        };
        screen.on('keypress', onKeypress);
        screenListeners.push(['keypress', onKeypress]);

        renderSearch(true);
        list.focus();
        screen.render();

        fetchServers({ userAgent })
            .then((entries) => {
                if (entries.length === 0) {
                    cleanup();
                    return reject(new Error('Server directory returned no entries'));
                }
                all = entries;
                caretTimer = setInterval(tickCaret, 500);
                refresh();
            })
            .catch((err) => {
                cleanup();
                reject(new Error(`Failed to fetch server list: ${err.message}`));
            });
    });
}

module.exports = { pickServer, fetchServers };
