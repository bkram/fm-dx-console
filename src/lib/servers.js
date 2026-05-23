import axios from 'axios';

const SERVER_LIST_URL = 'https://servers.fmdx.org/api/';
const FETCH_TIMEOUT_MS = 10000;

export async function fetchServers({ userAgent } = {}) {
    const headers = userAgent ? { 'User-Agent': userAgent } : {};
    const res = await axios.get(SERVER_LIST_URL, { headers, timeout: FETCH_TIMEOUT_MS });
    if (!res.data || !Array.isArray(res.data.dataset)) {
        throw new Error('Unexpected response shape from server directory');
    }
    return res.data.dataset.filter((e) => e && typeof e.url === 'string' && e.url);
}

function normalize(s) { return (s || '').toString().toLowerCase(); }

export function scoreEntry(entry, q) {
    if (!q) return 0;
    const fields = [
        [normalize(entry.name), 40],
        [normalize(entry.city), 20],
        [normalize(entry.countryName), 10],
        [normalize(entry.country), 30],
    ];
    let best = -1;
    for (const [h, w] of fields) {
        if (!h) continue;
        if (h === q) best = Math.max(best, w + 1000);
        else if (h.startsWith(q)) best = Math.max(best, w + 500);
        else {
            const i = h.indexOf(q);
            if (i !== -1) best = Math.max(best, w + 100 - Math.min(i, 99));
        }
    }
    return best;
}

export function sortEntries(list) {
    return list.slice().sort((a, b) => {
        const ca = normalize(a.countryName || a.country);
        const cb = normalize(b.countryName || b.country);
        if (ca !== cb) return ca < cb ? -1 : 1;
        return normalize(a.name) < normalize(b.name) ? -1 : 1;
    });
}

export function filterServers(all, { query, onlineOnly }) {
    const pool = all.filter((e) => !(onlineOnly && e.status !== 1));
    const needle = normalize(query);
    if (!needle) return sortEntries(pool);
    const scored = [];
    for (const e of pool) {
        const s = scoreEntry(e, needle);
        if (s >= 0) scored.push({ e, s });
    }
    scored.sort((a, b) => b.s - a.s);
    return scored.map((x) => x.e);
}
