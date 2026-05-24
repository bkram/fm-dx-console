import React from 'react';
import { Box, Text, useInput } from 'ink';
import { PTY_NAMES, RT_PLUS_LABELS } from '../lib/profiles.js';
import { colors } from '../theme.js';

function s(v, fallback = '—') {
    if (v === undefined || v === null) return fallback;
    const t = String(v).trim();
    return t === '' ? fallback : t;
}

// The decoder sometimes leaves control bytes in PS / RT strings rendered as
// `[0x0D]` markers. Strip both the literal markers and any raw control bytes.
function cleanRdsText(v) {
    if (v === undefined || v === null) return '—';
    let t = String(v)
        .replace(/\[0x[0-9A-Fa-f]{2}\]/g, '')   // [0x0D] etc.
        .replace(/[\x00-\x1f]/g, '')             // raw CR/LF/etc.
        .trim();
    return t === '' ? '—' : t;
}

function summariseAf(af, afType) {
    if (!af) return '—';
    const list = Array.isArray(af) ? af : String(af).split(/[\s,]+/).filter(Boolean);
    if (list.length === 0) return '—';
    const head = list.slice(0, 8).join(', ');
    const more = list.length > 8 ? `  (+${list.length - 8})` : '';
    const count = list.length > 1 ? `(${list.length}) ` : '';
    return `${count}${head}${more}${afType ? `   [${afType}]` : ''}`;
}

// Compact the stable-flag keys so the row fits in the modal.
function compactStableLabel(k) {
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
function timeOnly(t) {
    if (!t) return '—';
    const m = /(\d{1,2}:\d{2}(?::\d{2})?)/.exec(String(t));
    return m ? m[1] : String(t).trim();
}

function summariseEon(eon) {
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

function buildRtPlusLines(rtPlus, perLine = 2, maxTags = 6) {
    if (!rtPlus) return [];
    const list = [];
    if (Array.isArray(rtPlus)) {
        for (const t of rtPlus) {
            const ct = t.contentType;
            const text = cleanRdsText(t.text);
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

function formatGroups(stats) {
    if (!stats) return '—';
    if (typeof stats === 'number') return String(stats);
    if (typeof stats === 'object') {
        const total = stats.total || Object.values(stats).reduce((a, b) => a + (Number(b) || 0), 0);
        return String(total);
    }
    return '—';
}

function diLine(d) {
    const flags = [];
    if (d.diStereo) flags.push('Stereo');
    if (d.diArtificialHead) flags.push('Artificial Head');
    if (d.diCompressed) flags.push('Compressed');
    if (d.diDynamicPty) flags.push('Dynamic PTY');
    return flags.length ? flags.join(' · ') : '—';
}

function stableLine(flags) {
    if (!flags || typeof flags !== 'object') return '—';
    const parts = [];
    for (const [k, v] of Object.entries(flags)) {
        parts.push(`${compactStableLabel(k)}:${v ? '●' : '○'}`);
    }
    return parts.length ? parts.join(' ') : '—';
}

// Label is on the modal's blue bg — use cyan, not gray, so it stays readable.
const Lbl = ({ w = 7, children }) => <Text color={colors.title}>{String(children).padEnd(w)}</Text>;
const Val = ({ children }) => <Text color={colors.value}>{children}</Text>;

export default function AdvancedRds({ rds, onClose }) {
    useInput((input, key) => {
        if (key.escape || input === 'a' || input === 'A' || (key.ctrl && input === 'c')) onClose();
    });

    const d = rds || {};
    const ptyIdx = Number.isFinite(d.pty) ? d.pty : parseInt(d.pty, 10);
    const ptyName = !Number.isNaN(ptyIdx) ? (d.ptyName || PTY_NAMES[ptyIdx] || '—') : '—';
    const ptyDisplay = !Number.isNaN(ptyIdx) ? `${ptyIdx}/${ptyName}` : '—';

    const longPs = cleanRdsText(d.longPs);
    const ptyn = cleanRdsText(d.ptyn);
    const rtA = cleanRdsText(d.rtA || d.rt0);
    const rtB = cleanRdsText(d.rtB || d.rt1);
    const psClean = cleanRdsText(d.ps);

    const eon = summariseEon(d.eonData || d.eon);
    const rtPlusLines = buildRtPlusLines(d.rtPlusData || d.rtPlus);
    const odaList = Array.isArray(d.odaList) ? d.odaList : [];
    const indicators = [
        d.hasRtPlus ? 'RT+' : null,
        d.hasEon ? 'EON' : null,
        d.hasTmc ? 'TMC' : null,
        d.hasOda ? 'ODA' : null,
    ].filter(Boolean);

    return (
        <Box
            flexDirection="column"
            borderStyle="single"
            borderColor={colors.modalBorder}
            paddingX={2}
            width={74}
            backgroundColor={colors.modalBg}
            borderBackgroundColor={colors.modalBg}
        >
            <Text bold color={colors.title}>Advanced RDS</Text>
            <Text> </Text>

            <Text wrap="truncate"><Lbl>PI</Lbl><Val>{s(d.pi)}</Val>   <Lbl>PS</Lbl><Val>{psClean}</Val>   <Lbl>PTY</Lbl>{ptyDisplay}</Text>
            <Text wrap="truncate"><Lbl>LongPS</Lbl><Val>{longPs}</Val></Text>
            <Text wrap="truncate"><Lbl>PTYN</Lbl><Val>{ptyn}</Val></Text>
            <Text wrap="truncate"><Lbl>RT-A</Lbl>{rtA}</Text>
            <Text wrap="truncate"><Lbl>RT-B</Lbl>{rtB}</Text>
            <Text> </Text>

            <Text wrap="truncate">
                <Lbl>Flags</Lbl>
                <Text color={d.tp ? colors.ok : colors.modalFg}>TP </Text>
                <Text color={d.ta ? colors.ok : colors.modalFg}>TA </Text>
                <Text>  M/S {d.ms == 1 ? 'M' : d.ms == 0 ? 'S' : '—'}   DI {diLine(d)}</Text>
            </Text>
            <Text wrap="truncate"><Lbl>Stable</Lbl>{stableLine(d.stableFlags)}</Text>
            <Text wrap="truncate"><Lbl>Time</Lbl>{timeOnly(d.localTime)}   UTC {timeOnly(d.utcTime)}</Text>
            <Text wrap="truncate"><Lbl>Country</Lbl>ECC {s(d.ecc)}   LIC {s(d.lic)}   PIN {s(d.pin)}</Text>
            <Text wrap="truncate"><Lbl>AF</Lbl>{summariseAf(d.afList || d.af, d.afType)}</Text>
            {rtPlusLines.map((pair, idx) => (
                <Text key={`rtp${idx}`} wrap="truncate">
                    {idx === 0 ? <Lbl>RT+</Lbl> : <Text>       </Text>}
                    {pair.map((it, i) => (
                        <Text key={i}>
                            {i > 0 ? <Text dimColor>   ·   </Text> : null}
                            <Text color={colors.title}>{it.label}: </Text>
                            <Val>{it.text}</Val>
                        </Text>
                    ))}
                </Text>
            ))}
            {eon && <Text wrap="truncate"><Lbl>EON</Lbl>{eon}</Text>}
            {odaList.length > 0 && (
                <Text wrap="truncate"><Lbl>ODA</Lbl>{odaList.map((o) => o.app || o.name || o.aid || '?').join(', ')}</Text>
            )}
            {indicators.length > 0 && (
                <Text wrap="truncate"><Lbl>Has</Lbl><Text color={colors.ok}>{indicators.join(' ')}</Text></Text>
            )}
            <Text wrap="truncate"><Lbl>BER</Lbl>{d.ber !== undefined && d.ber !== null ? `${d.ber}` : '—'}   <Lbl w={7}>Groups</Lbl>{formatGroups(d.groupStats)}</Text>
            <Text> </Text>

            <Text color={colors.title}>(press a or Esc to close)</Text>
        </Box>
    );
}
