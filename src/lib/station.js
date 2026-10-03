// Transmitter fields use the webserver's azi key; accept older azimuth data too.
export function stationRows(data, { imperial = false } = {}) {
    const tx = data?.txInfo || {};
    const withUnit = (value, unit) => value === undefined || value === null || value === '' ? '' : `${value}${unit}`;
    const distance = Number(tx.dist);
    const dist = tx.dist === undefined || tx.dist === null || tx.dist === '' || !Number.isFinite(distance) ? ''
        : imperial ? `${Math.round(distance * 0.621371)} mi` : `${Math.round(distance)} km`;
    const others = Array.isArray(tx.otherMatches) ? tx.otherMatches.length : 0;
    return [
        { label: 'Name', value: tx.tx ? `${tx.tx}${others ? ` (+${others})` : ''}` : '' },
        { label: 'Loc', value: [tx.city, tx.itu].filter(Boolean).join(', ') },
        { label: 'Pol', value: String(tx.pol || '').toUpperCase() },
        { label: 'Dist', value: dist },
        { label: 'Azim', value: withUnit(tx.azi ?? tx.azimuth, '°') },
        { label: 'ERP', value: withUnit(tx.erp, ' kW') },
        { label: 'Reg PI', value: tx.reg === true ? String(tx.pi || '').toUpperCase() : '' },
        { label: 'Score', value: typeof tx.score === 'number' ? String(tx.score) : '' },
    ];
}
