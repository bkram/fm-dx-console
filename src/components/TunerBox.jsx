import { flagEnabled } from '../lib/display.js';
import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';
import { formatFrequency, formatBandwidth } from '../lib/display.js';

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
            <Text wrap="truncate">Freq    <Text color={colors.freq} bold>{formatFrequency(d.freq)} MHz</Text></Text>
            <Text wrap="truncate">BW      {formatBandwidth(d.bw)}</Text>
            <Text wrap="truncate">Antenna {ant}</Text>
            <Text wrap="truncate">iMS     {flagEnabled(d.ims) ? 'on' : 'off'}</Text>
            <Text wrap="truncate">EQ      {flagEnabled(d.eq) ? 'on' : 'off'}</Text>
        </Box>
    );
}
