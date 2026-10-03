// Keep URL paths and credentials case-sensitive; URL canonicalises the host.
export function normalizeUrl(value) {
    const url = new URL(String(value).trim());
    if (!['http:', 'https:'].includes(url.protocol)) {
        throw new TypeError('Server URL must use http:// or https://');
    }
    url.hash = '';
    url.pathname = url.pathname.replace(/\/+$/, '') + '/';
    return url.toString();
}

export function isValidURL(value) {
    try { normalizeUrl(value); return true; } catch { return false; }
}

export function endpointUrl(base, endpoint, websocket = false) {
    const url = new URL(normalizeUrl(base));
    url.pathname += endpoint;
    if (websocket) url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return url.toString();
}
