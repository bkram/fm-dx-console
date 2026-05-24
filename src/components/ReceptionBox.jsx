import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';

function bar(value, max, width) {
    if (max <= 0) return ' '.repeat(width);
    const filled = Math.max(0, Math.min(width, Math.round((value / max) * width)));
    return '█'.repeat(filled) + '░'.repeat(width - filled);
}

// FM-DX servers report signal in dBf. Convert to the user-selected unit for
// display only; the bar still scales against the raw dBf value so the visual
// meaning doesn't change between unit modes.
//
//   dBf  → dBµV : -11.25 (75Ω)
//   dBf  → dBm  : -120
function convertSig(dBf, unit) {
    if (unit === 'dBuV') return dBf - 11.25;
    if (unit === 'dBm') return dBf - 120;
    return dBf;
}

function unitLabel(unit) {
    if (unit === 'dBuV') return 'dBµV';
    if (unit === 'dBm') return 'dBm';
    return 'dBf';
}

export default function ReceptionBox({ data, unit = 'dBf', width = 36 }) {
    const d = data || {};
    const sigDbf = Number(d.sig) || 0;
    const sigDisplay = convertSig(sigDbf, unit);
    const max = 130;
    const w = Math.max(10, width - 18);
    const stereoLabel = d.st
        ? (d.stForced == '1' ? 'stereo (F)' : 'stereo')
        : 'mono';

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
            <Text bold color={colors.title}>Reception</Text>
            <Box>
                <Text>{sigDisplay.toFixed(1).padStart(7)} {unitLabel(unit).padEnd(4)} </Text>
                <Text color={sigDbf > 80 ? colors.ok : sigDbf > 40 ? colors.warn : colors.bad}>{bar(sigDbf, max, w)}</Text>
            </Box>
            <Text wrap="truncate">Mode    {stereoLabel}</Text>
            <Text wrap="truncate" color={colors.dim}>('u' to cycle units)</Text>
        </Box>
    );
}
