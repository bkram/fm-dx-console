import React from 'react';
import { Box, Text } from 'ink';
import { PTY_NAMES } from '../lib/profiles.js';
import { colors } from '../theme.js';

function shortAf(af) {
    if (!af) return '—';
    const list = Array.isArray(af) ? af : String(af).split(/[\s,]+/).filter(Boolean);
    if (list.length === 0) return '—';
    // wrap="truncate" on the Text element clips visually; show as many as fit.
    return list.join(', ');
}

function cleanRdsText(s) {
    return (s || '')
        .toString()
        .replace(/\[0x[0-9A-Fa-f]{2}\]/g, '')   // [0x0D] literals from the decoder
        .replace(/[\x00-\x1f]/g, '')             // raw control bytes
        .trim();
}

export default function RdsBox({ data, rdsAdv }) {
    const d = data || {};
    const ra = rdsAdv || {};
    const ptyIdx = parseInt(d.pty, 10);
    const ptyName = !Number.isNaN(ptyIdx) ? (PTY_NAMES[ptyIdx] || '—') : '—';
    const tp = d.tp ? 'TP' : '  ';
    const ta = d.ta ? 'TA' : '  ';
    const ms = d.ms == 1 ? 'M' : (d.ms == 0 ? 'S' : ' ');

    const psClean = cleanRdsText(d.ps);
    const longPs = cleanRdsText(ra.longPs);
    const ptyn = cleanRdsText(ra.ptyn);
    const showLongPs = !!longPs && longPs !== psClean;

    return (
        <Box
            flexDirection="column"
            borderStyle="single"
            borderColor={colors.border}
            backgroundColor={colors.bg}
            borderBackgroundColor={colors.bg}
            paddingX={1}
            flexBasis={0}
            flexGrow={1}
            flexShrink={1}
            overflow="hidden"
        >
            <Text bold color={colors.title}>RDS</Text>
            <Text wrap="truncate">PI      <Text color={colors.value}>{d.pi || '—'}</Text></Text>
            <Text wrap="truncate">PS      <Text color={colors.value}>{psClean || '—'}</Text></Text>
            {showLongPs && <Text wrap="truncate">LongPS  <Text color={colors.value}>{longPs}</Text></Text>}
            <Text wrap="truncate">PTY     {ptyIdx >= 0 ? `${ptyIdx}/${ptyName}` : '—'}</Text>
            {ptyn && <Text wrap="truncate">PTYN    <Text color={colors.value}>{ptyn}</Text></Text>}
            <Text wrap="truncate">Flags   {tp} {ta} {ms}</Text>
            <Text wrap="truncate">AF      {shortAf(d.af)}</Text>
        </Box>
    );
}
