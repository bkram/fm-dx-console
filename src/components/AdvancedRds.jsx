import React from 'react';
import { Box, Text, useInput } from 'ink';
import { PTY_NAMES } from '../lib/profiles.js';

export default function AdvancedRds({ rds, onClose }) {
    useInput((input, key) => {
        if (key.escape || input === 'a' || input === 'A' || (key.ctrl && input === 'c')) onClose();
    });

    const d = rds || {};
    const ptyIdx = parseInt(d.pty, 10);
    const ptyName = !Number.isNaN(ptyIdx) ? (PTY_NAMES[ptyIdx] || '—') : '—';

    return (
        <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={2} paddingY={1} width={68}>
            <Text bold color="green">Advanced RDS</Text>
            <Text> </Text>
            <Text>PI       {d.pi || '—'}</Text>
            <Text>PS       {d.ps || '—'}</Text>
            <Text>PTY      {ptyIdx >= 0 ? `${ptyIdx}/${ptyName}` : '—'}</Text>
            <Text>RT-A     {d.rtA || d.rt0 || '—'}</Text>
            <Text>RT-B     {d.rtB || d.rt1 || '—'}</Text>
            {d.rtPlus && <Text>RT+      {JSON.stringify(d.rtPlus)}</Text>}
            {d.eon && <Text>EON      {Array.isArray(d.eon) ? d.eon.map((e) => e.pi).join(', ') : '—'}</Text>}
            <Text>Decoder  DI={d.di ?? '—'}  MS={d.ms ?? '—'}  TP={d.tp ? 1 : 0}  TA={d.ta ? 1 : 0}</Text>
            <Text dimColor>(press a or Esc to close)</Text>
        </Box>
    );
}
