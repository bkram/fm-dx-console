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

export { scoreEntry, sortEntries, filterServers, filterRecentServers } from './server-catalog.js';
