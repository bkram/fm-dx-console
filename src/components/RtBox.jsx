import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';
import { RT_PLUS_LABELS } from '../lib/profiles.js';

function clean(s) {
    return (s || '')
        .toString()
        .replace(/\[0x[0-9A-Fa-f]{2}\]/g, '')
        .replace(/[\x00-\x1f]/g, '')
        .trim();
}

// Build the RT+ display for one line:
//   - if Title (1) and/or Artist (4) are present, show "♪ Title — Artist"
//     as the head, then append any *other* cached tags ("Album", "Genre"…)
//     separated by · and truncate to fit the row width.
//   - otherwise list up to four tag pairs straight.
function rtPlusLine(rdsAdv) {
    const tags = rdsAdv && Array.isArray(rdsAdv.rtPlusData) ? rdsAdv.rtPlusData : null;
    if (!tags || tags.length === 0) return null;
    const byType = new Map();
    for (const t of tags) {
        const txt = clean(t.text);
        if (txt) byType.set(t.contentType, txt);
    }
    if (byType.size === 0) return null;

    const title = byType.get(1);
    const artist = byType.get(4);
    const usedTypes = new Set();
    let song = null;
    if (title || artist) {
        song = { title: title || '—', artist: artist || '—' };
        usedTypes.add(1);
        usedTypes.add(4);
    }
    const others = [];
    for (const [ct, text] of byType) {
        if (usedTypes.has(ct)) continue;
        others.push({ label: RT_PLUS_LABELS[ct] || `#${ct}`, text });
        if (others.length >= 4) break;
    }
    return { song, others };
}

// Two content rows of RadioText + one row for RT+ when available.
// Height locked at 6 (1 border + 1 title + 2 RT + 1 RT+ + 1 border).
export default function RtBox({ data, rdsAdv }) {
    const d = data || {};
    const l1 = clean(d.rt0) || ' ';
    const l2 = clean(d.rt1) || ' ';
    const rtPlus = rtPlusLine(rdsAdv);

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
            <Text wrap="truncate">{l1}</Text>
            <Text wrap="truncate">{l2}</Text>
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
