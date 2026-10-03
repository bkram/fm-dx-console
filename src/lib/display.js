// Pure display rules used by Ink and Chromium. No DOM, React or Node imports.
export const SIGNAL_UNITS = ['dBf', 'dBuV', 'dBm'];
export function nextSignalUnit(unit) { return SIGNAL_UNITS[(SIGNAL_UNITS.indexOf(unit) + 1) % SIGNAL_UNITS.length]; }
export function unitLabel(unit) { return unit === 'dBuV' ? 'dBµV' : unit === 'dBm' ? 'dBm' : 'dBf'; }
export function convertSignal(dBf, unit) { return Number(dBf) - (unit === 'dBuV' ? 11.25 : unit === 'dBm' ? 120 : 0); }
export function formatFrequency(value) {
    return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
        ? Number(value).toFixed(3) : '—';
}
export function formatBandwidth(value) {
    if (value === undefined || value === null || value === '' || !Number.isFinite(Number(value))) return '—';
    return Number(value) === 0 ? 'Auto' : `${Math.round(Number(value) / 1000)} kHz`;
}
export function cleanRdsText(value, fallback = '') {
    return String(value ?? '').replace(/\[0x[0-9A-Fa-f]{2}\]/g, '').replace(/[\x00-\x1f\x7f]/g, '').trim() || fallback;
}

export function flagEnabled(value) { return value === true || value === 1 || value === '1'; }
export function clampVolume(value) { return Number.isFinite(Number(value)) ? Math.max(0, Math.min(100, Math.round(Number(value)))) : null; }
