import React from 'react';
import { Box, Text } from 'ink';

// RDS RadioText — always reserves 2 lines.
export default function RtBox({ data }) {
    const d = data || {};
    const l1 = (d.rt0 || '').trim() || ' ';
    const l2 = (d.rt1 || '').trim() || ' ';
    return (
        <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={1} height={4}>
            <Text bold color="green">RDS Radiotext</Text>
            <Text>{l1}</Text>
            <Text>{l2}</Text>
        </Box>
    );
}
