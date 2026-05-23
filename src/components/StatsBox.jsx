import React from 'react';
import { Box, Text } from 'ink';

export default function StatsBox({ data, pingTime }) {
    const d = data || {};
    return (
        <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={1} flexGrow={1}>
            <Text bold color="green">Status</Text>
            <Text>Users   {d.users ?? '—'}</Text>
            <Text>Ping    {pingTime !== null && pingTime !== undefined ? `${pingTime} ms` : '—'}</Text>
        </Box>
    );
}
