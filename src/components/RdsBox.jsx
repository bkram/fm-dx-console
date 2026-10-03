import { flagEnabled } from '../lib/display.js';
import React from 'react';
import { Box, Text } from 'ink';
import { broadcastModel } from '../lib/rds-display.js';
import { colors } from '../theme.js';

export default function RdsBox({ data, rdsAdv }) {
    const d = data || {};
    const model = broadcastModel(data, rdsAdv);
    const { ps: psClean, longPs, ptyn, showLongPs } = model;
    const tp = flagEnabled(d.tp) ? 'TP' : '  ';
    const ta = flagEnabled(d.ta) ? 'TA' : '  ';
    const ms = d.ms == 1 ? 'M' : (d.ms == 0 ? 'S' : ' ');

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
            <Text bold color={colors.title}>RDS</Text>
            <Text wrap="truncate">PI      <Text color={colors.value}>{d.pi || '—'}</Text></Text>
            <Text wrap="truncate">PS      <Text color={colors.value}>{psClean || '—'}</Text></Text>
            {showLongPs && <Text wrap="truncate">LongPS  <Text color={colors.value}>{longPs}</Text></Text>}
            <Text wrap="truncate">PTY     {model.ptyDisplay}</Text>
            {ptyn && <Text wrap="truncate">PTYN    <Text color={colors.value}>{ptyn}</Text></Text>}
            <Text wrap="truncate">Flags   {tp} {ta} {ms}</Text>
            <Text wrap="truncate">AF      {model.af.join(', ') || '—'}</Text>
        </Box>
    );
}
