import React from 'react';
import { Box, Text, useInput } from 'ink';

const ROWS = [
    ["'←'  decrease 0.1 MHz",  "'→'  increase 0.1 MHz"],
    ["'↓'  decrease 0.01 MHz", "'↑'  increase 0.01 MHz"],
    ["'z'  decrease 1 MHz",    "'x'  increase 1 MHz"],
    ["'r'  refresh / re-tune", "'t'  set frequency"],
    ["'p'  toggle audio",       "'C'  send raw command"],
    ["'['  toggle iMS",         "']'  toggle EQ"],
    ["'y'  cycle antenna",      "'f'  forced stereo"],
    ["'s'  server info",        "'a'  advanced RDS"],
    ["'b'  bandwidth",          "'g'  AGC (Si47xx)"],
    ["'m'  switch server",      "'Esc'  quit"],
    ["'h'  toggle help",        ""],
];

export default function HelpOverlay({ onClose }) {
    useInput((input, key) => {
        if (key.escape || input === 'h' || input === 'H' || (key.ctrl && input === 'c')) {
            onClose();
        }
    });
    return (
        <Box borderStyle="round" borderColor="green" flexDirection="column" paddingX={2} paddingY={1}>
            <Text bold>Press key to:</Text>
            <Text> </Text>
            {ROWS.map(([l, r], i) => (
                <Text key={i}>{l.padEnd(28)}  {r}</Text>
            ))}
            <Text> </Text>
            <Text dimColor>(press h or Esc to close)</Text>
        </Box>
    );
}
