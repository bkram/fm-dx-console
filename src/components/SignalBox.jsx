import React from 'react';
import { Box, Text } from 'ink';

// Build a bar of `width` cells representing `value` between 0 and `max`.
function bar(value, max, width) {
    if (max <= 0) return ' '.repeat(width);
    const filled = Math.max(0, Math.min(width, Math.round((value / max) * width)));
    return '█'.repeat(filled) + '░'.repeat(width - filled);
}

export default function SignalBox({ data, width = 36 }) {
    const sig = (data && Number(data.sig)) || 0;
    const max = 130; // dBf-ish full scale; tweakable
    const w = Math.max(10, width - 14);
    return (
        <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={1} flexGrow={1}>
            <Text bold color="green">Signal</Text>
            <Box>
                <Text>{sig.toFixed(1).padStart(6)} dBf  </Text>
                <Text color={sig > 80 ? 'green' : sig > 40 ? 'yellow' : 'red'}>{bar(sig, max, w)}</Text>
            </Box>
        </Box>
    );
}
