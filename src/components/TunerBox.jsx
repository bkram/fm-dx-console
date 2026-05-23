import React from 'react';
import { Box, Text } from 'ink';

function fmt(v, fallback = '—') {
    return v === undefined || v === null || v === '' ? fallback : v;
}

function freqDisplay(freq) {
    if (freq === undefined || freq === null) return '—';
    const n = Number(freq);
    if (Number.isNaN(n)) return String(freq);
    return n.toFixed(3) + ' MHz';
}

export default function TunerBox({ data, tunerInfo, audioPlaying }) {
    const d = data || {};
    const ant = tunerInfo?.antNames?.[parseInt(d.ant, 10) || 0] || 'Default';
    const bwLabel = d.bw ? `${(Number(d.bw) / 1000).toFixed(0)} kHz` : '—';

    return (
        <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={1} flexGrow={1}>
            <Text bold color="green">Tuner</Text>
            <Text>Freq    <Text color="cyan" bold>{freqDisplay(d.freq)}</Text></Text>
            <Text>BW      {bwLabel}</Text>
            <Text>iMS     {fmt(d.ims) ? (d.ims ? 'on' : 'off') : 'off'}    EQ      {d.eq ? 'on' : 'off'}</Text>
            <Text>St      {d.st ? 'stereo' : 'mono'}{d.stForced == '1' ? ' (forced)' : ''}</Text>
            <Text>Antenna {ant}</Text>
            <Text>Audio   {audioPlaying ? <Text color="green">playing</Text> : <Text dimColor>stopped</Text>}</Text>
        </Box>
    );
}
