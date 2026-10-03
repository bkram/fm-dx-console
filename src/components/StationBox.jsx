import { stationRows } from '../lib/station.js';
import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';

export default function StationBox({ data }) {
    const rows = stationRows(data).filter(row => row.value).map(row => `${row.label.padEnd(7)}${row.value}`);

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
            <Text bold color={colors.title}>Station</Text>
            {rows.length === 0
                ? <Text dimColor>(no station data)</Text>
                : rows.map((r, i) => <Text key={i} wrap="truncate">{r}</Text>)}
        </Box>
    );
}
