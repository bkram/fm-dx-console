import React from 'react';
import { Box, Text } from 'ink';
import { PTY_NAMES } from '../lib/profiles.js';

export default function RdsBox({ data }) {
    const d = data || {};
    const ptyIdx = parseInt(d.pty, 10);
    const ptyName = !Number.isNaN(ptyIdx) ? (PTY_NAMES[ptyIdx] || '—') : '—';
    const tp = d.tp ? 'TP' : '  ';
    const ta = d.ta ? 'TA' : '  ';
    const ms = d.ms == 1 ? 'M' : (d.ms == 0 ? 'S' : ' ');

    return (
        <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={1} flexGrow={1}>
            <Text bold color="green">RDS</Text>
            <Text>PI     <Text color="yellow">{d.pi || '—'}</Text></Text>
            <Text>PS     <Text color="yellow">{d.ps || '—'}</Text></Text>
            <Text>PTY    {ptyIdx >= 0 ? `${ptyIdx}/${ptyName}` : '—'}</Text>
            <Text>Flags  {tp} {ta} {ms}</Text>
            <Text>AF     {Array.isArray(d.af) ? d.af.join(', ') : (d.af || '—')}</Text>
        </Box>
    );
}
