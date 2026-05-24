import React from 'react';
import { Box, Text } from 'ink';
import { MIN_COLS, MIN_ROWS } from '../lib/useTerminalSize.js';

export default function TooSmall({ cols, rows }) {
    return (
        <Box flexDirection="column" padding={1}>
            <Text color="red" bold>Terminal too small</Text>
            <Text>Current size: {cols}×{rows}</Text>
            <Text>Minimum size: {MIN_COLS}×{MIN_ROWS}</Text>
            <Text dimColor>Resize the window and the UI will redraw.</Text>
        </Box>
    );
}
