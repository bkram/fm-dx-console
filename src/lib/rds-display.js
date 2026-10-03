import { PTY_NAMES, RT_PLUS_LABELS } from './profiles.js';
import { cleanRdsText, flagEnabled } from './display.js';

export function s(v, fallback = '—') {
    if (v === undefined || v === null) return fallback;
    const t = String(v).trim();
    return t === '' ? fallback : t;
}

export function summariseAf(af, afType) {
    if (!af) return '—';
    const list = Array.isArray(af) ? af : String(af).split(/[\s,]+/).filter(Boolean);
    if (list.length === 0) return '—';
    const head = list.slice(0, 8).join(', ');
    const more = list.length > 8 ? `  (+${list.length - 8})` : '';
    const count = list.length > 1 ? `(${list.length}) ` : '';
    return `${count}${head}${more}${afType ? `   [${afType}]` : ''}`;
}

// Compact the stable-flag keys so the row fits in the modal.
export function compactStableLabel(k) {
    return String(k)
        .replace(/Stable$/i, '')
        .replace(/^diStereo$/, 'DI-S')
        .replace(/^diAh$/, 'DI-AH')
        .replace(/^diCompressed$/, 'DI-C')
        .replace(/^diDynamicPty$/, 'DI-DP')
        .replace(/^tp$/, 'TP')
        .replace(/^ta$/, 'TA')
        .replace(/^ms$/, 'M/S')
        .replace(/^pi$/, 'PI')
        .replace(/^ps$/, 'PS')
        .replace(/^pty$/, 'PTY')
        .replace(/^rt$/, 'RT');
}

// HH:MM:SS or HH:MM from things like '24/05/2026 07:14'.
export function timeOnly(t) {
    if (!t) return '—';
    const m = /(\d{1,2}:\d{2}(?::\d{2})?)/.exec(String(t));
    return m ? m[1] : String(t).trim();
}

export function summariseEon(eon) {
    if (!eon) return null;
    if (Array.isArray(eon)) {
        if (eon.length === 0) return null;
        return eon.slice(0, 4).map((e) => {
            const pi = e.pi || e.PI || '—';
            const ps = (e.ps || e.psName || '').trim();
            return ps ? `${pi}(${ps})` : pi;
        }).join('  ') + (eon.length > 4 ? `  +${eon.length - 4}` : '');
    }
    if (typeof eon === 'object') {
        const keys = Object.keys(eon);
        if (keys.length === 0) return null;
        return keys.slice(0, 4).map((k) => {
            const entry = eon[k] || {};
            const ps = (entry.ps || entry.psName || '').trim();
            return ps ? `${k}(${ps})` : k;
        }).join('  ') + (keys.length > 4 ? `  +${keys.length - 4}` : '');
    }
    return null;
}

export function buildRtPlusLines(rtPlus, perLine = 2, maxTags = 6) {
    if (!rtPlus) return [];
    const list = [];
    if (Array.isArray(rtPlus)) {
        for (const t of rtPlus) {
            const ct = t.contentType;
            const text = cleanRdsText(t.text, '—');
            if (text === '—') continue;
            const label = (ct && RT_PLUS_LABELS[ct]) || t.label || t.tag || (ct ? `#${ct}` : '?');
            list.push({ label, text });
            if (list.length >= maxTags) break;
        }
    } else if (typeof rtPlus === 'object') {
        for (const [k, v] of Object.entries(rtPlus)) {
            if (v == null || v === '') continue;
            list.push({ label: String(k), text: String(v) });
            if (list.length >= maxTags) break;
        }
    }
    const lines = [];
    for (let i = 0; i < list.length; i += perLine) {
        lines.push(list.slice(i, i + perLine));
    }
    return lines;
}

export function formatGroups(stats) {
    if (!stats) return '—';
    if (typeof stats === 'number') return String(stats);
    if (Array.isArray(stats)) return String(stats.reduce((total, item) => total + (Number(item.count) || 0), 0));
    if (typeof stats === 'object') {
        const total = stats.total || Object.values(stats).reduce((a, b) => a + (Number(b) || 0), 0);
        return String(total);
    }
    return '—';
}

export function diLine(d) {
    const flags = [];
    if (flagEnabled(d.diStereo)) flags.push('Stereo');
    if (flagEnabled(d.diArtificialHead)) flags.push('Artificial Head');
    if (flagEnabled(d.diCompressed)) flags.push('Compressed');
    if (flagEnabled(d.diDynamicPty)) flags.push('Dynamic PTY');
    return flags.length ? flags.join(' · ') : '—';
}

export function stableLine(flags) {
    if (!flags || typeof flags !== 'object') return '—';
    const parts = [];
    for (const [k, v] of Object.entries(flags)) {
        parts.push(`${compactStableLabel(k)}:${flagEnabled(v) ? '●' : '○'}`);
    }
    return parts.length ? parts.join(' ') : '—';
}

export function advancedRdsModel(rds) {
    const d = rds || {};
    const ptyIdx = Number.isFinite(d.pty) ? d.pty : parseInt(d.pty, 10);
    const ptyName = !Number.isNaN(ptyIdx) ? (d.ptyName || PTY_NAMES[ptyIdx] || '—') : '—';
    const ptyDisplay = !Number.isNaN(ptyIdx) ? `${ptyIdx}/${ptyName}` : '—';

    const longPs = cleanRdsText(d.longPs, '—');
    const ptyn = cleanRdsText(d.ptyn, '—');
    const rtA = cleanRdsText(d.rtA || d.rt0, '—');
    const rtB = cleanRdsText(d.rtB || d.rt1, '—');
    const psClean = cleanRdsText(d.ps, '—');

    const eon = summariseEon(d.eonData || d.eon);
    const rtPlusLines = buildRtPlusLines(d.rtPlusData || d.rtPlus);
    const odaList = Array.isArray(d.odaList) ? d.odaList : [];
    const indicators = [
        d.hasRtPlus ? 'RT+' : null,
        d.hasEon ? 'EON' : null,
        d.hasTmc ? 'TMC' : null,
        d.hasOda ? 'ODA' : null,
    ].filter(Boolean);

    return { d, ptyDisplay, longPs, ptyn, rtA, rtB, psClean, eon, rtPlusLines, odaList, indicators };
}

// Build the RT+ display for one line:
//   - if Title (1) and/or Artist (4) are present, show "♪ Title — Artist"
//     as the head, then append any *other* cached tags ("Album", "Genre"…)
//     separated by · and truncate to fit the row width.
//   - otherwise list up to four tag pairs straight.
export function rtPlusLine(rdsAdv) {
    const tags = rdsAdv && Array.isArray(rdsAdv.rtPlusData) ? rdsAdv.rtPlusData : null;
    if (!tags || tags.length === 0) return null;
    const byType = new Map();
    for (const t of tags) {
        const txt = cleanRdsText(t.text);
        if (txt) byType.set(t.contentType, txt);
    }
    if (byType.size === 0) return null;

    const title = byType.get(1);
    const artist = byType.get(4);
    const usedTypes = new Set();
    let song = null;
    if (title || artist) {
        song = { title: title || '—', artist: artist || '—' };
        usedTypes.add(1);
        usedTypes.add(4);
    }
    const others = [];
    for (const [ct, text] of byType) {
        if (usedTypes.has(ct)) continue;
        others.push({ label: RT_PLUS_LABELS[ct] || `#${ct}`, text });
        if (others.length >= 4) break;
    }
    return { song, others };
}


export function broadcastModel(data, advanced) {
    const d = data || {};
    const a = advanced || {};
    const ps = cleanRdsText(d.ps);
    const longPs = cleanRdsText(a.longPs);
    const ptyn = cleanRdsText(a.ptyn);
    const pty = Number.parseInt(d.pty, 10);
    const ptyName = PTY_NAMES[pty] || '—';
    const rtFlag = a.rtAbFlag === 'B' ? 'B' : 'A';
    const fallback = [cleanRdsText(d.rt0), cleanRdsText(d.rt1)].filter(Boolean).join(' ');
    // /text contains the current message; worker snapshots preserve both A/B.
    const rtA = cleanRdsText(a.rtA) || (rtFlag === 'A' ? fallback : '');
    const rtB = cleanRdsText(a.rtB) || (rtFlag === 'B' ? fallback : '');
    const af = Array.isArray(d.af) ? d.af.map(Number).filter(Number.isFinite)
        .map(value => value > 108 ? value / 1000 : value).sort((left, right) => left - right) : [];
    return { ps, longPs, showLongPs: !!longPs && longPs !== ps, ptyn, pty, ptyName,
        ptyDisplay: pty >= 0 ? `${pty}/${ptyName}` : '—', rtFlag, rtA, rtB, af, rtPlus: rtPlusLine(a) };
}
