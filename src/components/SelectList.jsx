import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { colors } from '../theme.js';

// Generic single-select list rendered inside a labelled box.
// items: [{ label, value, value2? }]
export default function SelectList({ title, items, initialIndex = 0, onSelect, onCancel, width }) {
    const [selected, setSelected] = useState(initialIndex);

    useEffect(() => { setSelected(initialIndex); }, [initialIndex]);

    useInput((input, key) => {
        if (key.escape || (key.ctrl && input === 'c')) { onCancel(); return; }
        if (key.return) {
            const item = items[selected];
            if (item) onSelect(item);
            return;
        }
        if (key.upArrow) { setSelected((i) => Math.max(0, i - 1)); return; }
        if (key.downArrow) { setSelected((i) => Math.min(items.length - 1, i + 1)); return; }
        if (key.home) { setSelected(0); return; }
        if (key.end) { setSelected(items.length - 1); return; }
    });

    return (
        <Box
            borderStyle="single"
            borderColor={colors.modalBorder}
            flexDirection="column"
            width={width || 32}
            paddingX={2}
            backgroundColor={colors.modalBg}
            borderBackgroundColor={colors.modalBg}
        >
            {title && (
                <>
                    <Text bold color={colors.title}>{title}</Text>
                    <Text> </Text>
                </>
            )}
            {items.map((it, i) => {
                const isSel = i === selected;
                return (
                    <Text
                        key={i}
                        backgroundColor={isSel ? colors.selectionBg : undefined}
                        color={isSel ? colors.selectionFg : colors.modalFg}
                        bold={isSel}
                    >
                        {it.label}
                    </Text>
                );
            })}
            <Text> </Text>
            <Text color={colors.title}>Enter=apply  Esc=cancel</Text>
        </Box>
    );
}
