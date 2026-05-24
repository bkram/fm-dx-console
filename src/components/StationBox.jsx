import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';

function line(label, value) {
    return value ? `${label.padEnd(7)}${value}` : null;
}

export default function StationBox({ data }) {
    const tx = (data && data.txInfo) || {};
    const rows = [
        line('Name', tx.tx),
        line('Loc', [tx.city, tx.itu].filter(Boolean).join(', ')),
        line('Pol', tx.pol),
        line('Dist', tx.dist ? `${tx.dist} km` : ''),
        line('Azim', tx.azimuth ? `${tx.azimuth}°` : ''),
        line('ERP', tx.erp ? `${tx.erp} kW` : ''),
    ].filter(Boolean);

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
