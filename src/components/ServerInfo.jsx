import React from 'react';
import { Box, Text, useInput } from 'ink';

export default function ServerInfo({ tunerInfo, url, onClose }) {
    useInput((input, key) => {
        if (key.escape || input === 's' || input === 'S' || (key.ctrl && input === 'c')) onClose();
    });
    const ant = (tunerInfo?.antNames || []).join(', ');
    return (
        <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={2} paddingY={1} width={68}>
            <Text bold color="green">Server</Text>
            <Text> </Text>
            <Text>URL      {url || '—'}</Text>
            <Text>Tuner    {tunerInfo?.tunerName || '—'}</Text>
            <Text>Type     {tunerInfo?.tunerType || '—'}</Text>
            <Text>About    {tunerInfo?.tunerDesc || '—'}</Text>
            <Text>Antennas {ant || '—'}</Text>
            <Text dimColor>(press s or Esc to close)</Text>
        </Box>
    );
}
