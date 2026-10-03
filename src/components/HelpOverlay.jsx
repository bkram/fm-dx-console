import { SHORTCUTS } from '../lib/shortcuts.js';
import React from 'react';
import { Box, Text, useInput } from 'ink';
import { colors } from '../theme.js';

const ROWS = [];
for (let index = 0; index < SHORTCUTS.length; index += 2) {
    ROWS.push(SHORTCUTS.slice(index, index + 2).map(item => [item.label || item.keys[0], item.description]));
}

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
            {ROWS.map(([[kL, dL], [kR, dR] = ['', '']], i) => (
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
