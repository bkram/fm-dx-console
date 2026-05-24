import React from 'react';
import { Box, Text, useInput } from 'ink';
import { colors } from '../theme.js';

const ROWS = [
    [['←',   'decrease 0.1 MHz'],  ['→',  'increase 0.1 MHz']],
    [['↓',   'decrease 0.01 MHz'], ['↑',  'increase 0.01 MHz']],
    [['z',   'decrease 1 MHz'],    ['x',  'increase 1 MHz']],
    [['r',   'refresh / re-tune'], ['t',  'set frequency']],
    [['p',   'toggle audio'],      ['C',  'send raw command']],
    [['+/=', 'volume up'],         ['-',  'volume down']],
    [['0',   'mute'],              ['',   '']],
    [['[',   'toggle iMS'],        [']',  'toggle EQ']],
    [['y',   'cycle antenna'],     ['f',  'forced stereo']],
    [['s',   'server info'],       ['a',  'advanced RDS']],
    [['b',   'bandwidth'],         ['g',  'AGC (Si47xx)']],
    [['u',   'cycle signal unit'], ['m',  'switch server']],
    [['h',   'toggle help'],       ['Esc','back / quit']],
];

function quoted(k) {
    return k ? `'${k}'` : '';
}

export default function HelpOverlay({ onClose }) {
    useInput((input, key) => {
        if (key.escape || input === 'h' || input === 'H' || (key.ctrl && input === 'c')) {
            onClose();
        }
    });
    return (
        <Box
            borderStyle="single"
            borderColor={colors.modalBorder}
            flexDirection="column"
            paddingX={2}
            backgroundColor={colors.modalBg}
            borderBackgroundColor={colors.modalBg}
        >
            <Text bold color={colors.title}>Keymap</Text>
            <Text> </Text>
            {ROWS.map(([[kL, dL], [kR, dR]], i) => (
                <Text key={i} wrap="truncate">
                    <Text color={colors.title}>{quoted(kL).padEnd(7)}</Text>
                    <Text color={colors.modalFg}>{dL.padEnd(22)}</Text>
                    <Text color={colors.title}>{quoted(kR).padEnd(7)}</Text>
                    <Text color={colors.modalFg}>{dR}</Text>
                </Text>
            ))}
            <Text> </Text>
            <Text color={colors.title}>(press h or Esc to close)</Text>
        </Box>
    );
}
