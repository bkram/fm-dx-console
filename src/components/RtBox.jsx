import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';
import { broadcastModel } from '../lib/rds-display.js';

// Two content rows of RadioText + one row for RT+ when available.
// Height locked at 6 (1 border + 1 title + 2 RT + 1 RT+ + 1 border).
export default function RtBox({ data, rdsAdv }) {
    const { rtA, rtB, rtPlus } = broadcastModel(data, rdsAdv);

    return (
        <Box
            flexDirection="column"
            borderStyle="single"
            borderColor={colors.border}
            backgroundColor={colors.bg}
            borderBackgroundColor={colors.bg}
            paddingX={1}
            height={6}
            flexShrink={0}
            overflow="hidden"
        >
            <Text bold color={colors.title}>RDS Radiotext</Text>
            <Text wrap="truncate">{rtA || ' '}</Text>
            <Text wrap="truncate">{rtB || ' '}</Text>
            {rtPlus ? (
                <Text wrap="truncate">
                    {rtPlus.song ? (
                        <Text>
                            <Text color={colors.title}>♪ </Text>
                            <Text color={colors.value}>{rtPlus.song.title}</Text>
                            <Text dimColor> — </Text>
                            <Text color={colors.value}>{rtPlus.song.artist}</Text>
                        </Text>
                    ) : (
                        <Text color={colors.title}>RT+ </Text>
                    )}
                    {rtPlus.others.map((it, i) => (
                        <Text key={i}>
                            <Text dimColor>  ·  </Text>
                            <Text color={colors.title}>{it.label}: </Text>
                            <Text color={colors.value}>{it.text}</Text>
                        </Text>
                    ))}
                </Text>
            ) : (
                <Text> </Text>
            )}
        </Box>
    );
}
