export function parseSpectrumData(value) {
    const points = {};
    for (const pair of String(value || '').split(',')) {
        const parts = pair.split('=');
        if (parts.length !== 2 || !parts.every(part => part.trim())) continue;
        const [frequency, signal] = parts.map(Number);
        if (!Number.isFinite(frequency) || frequency < 64000 || frequency > 108000 || !Number.isFinite(signal)) continue;
        points[frequency / 1000] = signal;
    }
    return points;
}
