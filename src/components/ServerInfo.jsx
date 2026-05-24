import React from 'react';
import { Box, Text, useInput } from 'ink';
import { colors } from '../theme.js';

export default function ServerInfo({ tunerInfo, url, onClose }) {
    useInput((input, key) => {
        if (key.escape || input === 's' || input === 'S' || (key.ctrl && input === 'c')) onClose();
    });
    const ant = (tunerInfo?.antNames || []).join(', ');
    return (
        <Box
            flexDirection="column"
            borderStyle="single"
            borderColor={colors.modalBorder}
            paddingX={2}
            width={68}
            backgroundColor={colors.modalBg}
            borderBackgroundColor={colors.modalBg}
        >
            <Text bold color={colors.title}>Server</Text>
            <Text> </Text>
            <Text color={colors.modalFg}><Text color={colors.title}>URL     </Text> {url || '—'}</Text>
            <Text color={colors.modalFg}><Text color={colors.title}>Tuner   </Text> <Text color={colors.value}>{tunerInfo?.tunerName || '—'}</Text></Text>
            <Text color={colors.modalFg}><Text color={colors.title}>Type    </Text> {tunerInfo?.tunerType || '—'}</Text>
            <Text color={colors.modalFg}><Text color={colors.title}>About   </Text> {tunerInfo?.tunerDesc || '—'}</Text>
            <Text color={colors.modalFg}><Text color={colors.title}>Antennas</Text> {ant || '—'}</Text>
            <Text> </Text>
            <Text color={colors.title}>(press s or Esc to close)</Text>
        </Box>
    );
}
