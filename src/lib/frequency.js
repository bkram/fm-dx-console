// Accept MHz, the old shorthand (985), or kHz (98500), without partial parses.
export function parseFrequency(input) {
    const text = String(input ?? '').trim().replace(',', '.');
    if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
    let value = Number(text);
    if (!Number.isFinite(value) || value <= 0) return null;
    if (value >= 64000) value /= 1000;
    else if (value > 108) value /= 10;
    else if (value < 64) value *= 10;
    // Include the OIRT FM band as well as the usual 87.5–108 MHz band.
    if (value < 64 || value > 108) return null;
    return Math.round(value * 1000) / 1000;
}
