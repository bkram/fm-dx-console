import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';

function freqDisplay(freq) {
    if (freq === undefined || freq === null) return '—';
    const n = Number(freq);
    if (Number.isNaN(n)) return String(freq);
    return n.toFixed(3) + ' MHz';
}

function bwDisplay(bw) {
    if (bw === undefined || bw === null || bw === '') return '—';
    const n = Number(bw);
    if (Number.isNaN(n)) return String(bw);
    if (n === 0) return 'Auto';
    return `${Math.round(n / 1000)} kHz`;
}

// Tuner: pure RF/receiver settings. Audio playback, signal quality, and
// broadcast metadata live in their own panels.
export default function TunerBox({ data, tunerInfo }) {
    const d = data || {};
    const ant = tunerInfo?.antNames?.[parseInt(d.ant, 10) || 0] || 'Default';

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
            <Text bold color={colors.title}>Tuner</Text>
            <Text wrap="truncate">Freq    <Text color={colors.freq} bold>{freqDisplay(d.freq)}</Text></Text>
            <Text wrap="truncate">BW      {bwDisplay(d.bw)}</Text>
            <Text wrap="truncate">Antenna {ant}</Text>
            <Text wrap="truncate">iMS     {d.ims ? 'on' : 'off'}</Text>
            <Text wrap="truncate">EQ      {d.eq ? 'on' : 'off'}</Text>
        </Box>
    );
}
