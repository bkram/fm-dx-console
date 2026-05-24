import React from 'react';
import { Box, Text } from 'ink';
import VuMeter from './VuMeter.jsx';
import { colors } from '../theme.js';

function volumeBar(vol, width = 10) {
    const v = Math.max(0, Math.min(100, Math.round(vol)));
    const filled = Math.round((v / 100) * width);
    return '█'.repeat(filled) + '░'.repeat(width - filled);
}

export default function AudioBox({ audioPlaying, volume = 100, levels, holds }) {
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
            <Text bold color={colors.title}>Audio</Text>
            <Text wrap="truncate">
                State  {audioPlaying ? <Text color={colors.ok}>playing</Text> : <Text dimColor>stopped</Text>}
            </Text>
            <Text wrap="truncate">
                Vol    <Text color={volume === 0 ? colors.bad : colors.freq}>{volumeBar(volume)}</Text> {String(volume).padStart(3)}%
            </Text>
            <VuMeter levels={levels} holds={holds} width={10} />
        </Box>
    );
}
