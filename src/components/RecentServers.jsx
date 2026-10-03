import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { colors } from '../theme.js';
import { filterRecentServers } from '../lib/server-catalog.js';
import useTerminalSize from '../lib/useTerminalSize.js';

export default function RecentServers({ servers, onPick, onBrowse, onManual, onCancel }) {
    const { cols, rows } = useTerminalSize();
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState(0);
    const matches = useMemo(() => filterRecentServers(servers, query), [servers, query]);
    const items = [
        ...matches.map((entry) => ({ label: entry.name ? `${entry.name} · ${entry.url}` : entry.url, action: () => onPick(entry.url) })),
        { label: 'Browse public servers', action: onBrowse },
        { label: 'Enter URL', action: onManual },
    ];
    const index = Math.min(selected, items.length - 1);
    const visibleRows = Math.max(1, rows - 9);
    const start = Math.max(0, Math.min(items.length - visibleRows, index - Math.floor(visibleRows / 2)));
    useInput((input, key) => {
        if (key.escape || (key.ctrl && input === 'c')) { onCancel(); return; }
        if (key.return) { items[index]?.action(); return; }
        if (key.upArrow) { setSelected(Math.max(0, index - 1)); return; }
        if (key.downArrow) { setSelected(Math.min(items.length - 1, index + 1)); return; }
        if (key.pageUp) { setSelected(Math.max(0, index - visibleRows)); return; }
        if (key.pageDown) { setSelected(Math.min(items.length - 1, index + visibleRows)); return; }
        if (key.home) { setSelected(0); return; }
        if (key.end) { setSelected(items.length - 1); return; }
        if (key.backspace || key.delete) { setQuery((text) => text.slice(0, -1)); setSelected(0); return; }
        if (key.ctrl && input === 'u') { setQuery(''); setSelected(0); return; }
        if (input && !key.ctrl && !key.meta && input >= ' ') { setQuery((text) => text + input); setSelected(0); }
    });
    return (
        <Box flexDirection="column" width={cols} height={rows} backgroundColor={colors.bg}>
            <Text bold color={colors.title}>Choose a server</Text>
            <Text color={colors.dim}>Last {servers.length} connected servers · newest first</Text>
            <Text>Search: {query}<Text inverse> </Text></Text>
            <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor={colors.border} paddingX={1}>
                {servers.length === 0 && <Text dimColor>No recent servers yet.</Text>}
                {items.slice(start, start + visibleRows).map((item, offset) => (
                    <Text key={start + offset} wrap="truncate-end"
                        color={index === start + offset ? colors.selectionFg : colors.value}
                        backgroundColor={index === start + offset ? colors.selectionBg : undefined}>
                        {item.label}
                    </Text>
                ))}
            </Box>
            <Text color={colors.dim}>Enter=connect  ↑/↓=move  PgUp/PgDn=scroll  type=filter  Esc=cancel</Text>
        </Box>
    );
}
