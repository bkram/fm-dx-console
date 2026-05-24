import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import Spinner from 'ink-spinner';
import { fetchServers, filterServers } from '../lib/servers.js';
import { colors } from '../theme.js';

function formatRow(entry) {
    const country = (entry.country || '??').toUpperCase().padEnd(2, ' ');
    const name = entry.name || '(unnamed)';
    const city = entry.city ? ` — ${entry.city}` : '';
    const version = entry.version ? `  v${entry.version}` : '';
    const offline = entry.status !== 1 ? '  [offline]' : '';
    return `${country}  ${name}${city}${version}${offline}`;
}

export default function ServerPicker({ userAgent, onPick, onCancel }) {
    const { stdout } = useStdout();
    const [all, setAll] = useState(null);
    const [error, setError] = useState(null);
    const [query, setQuery] = useState('');
    const [onlineOnly, setOnlineOnly] = useState(true);
    const [selected, setSelected] = useState(0);

    useEffect(() => {
        let cancelled = false;
        fetchServers({ userAgent })
            .then((list) => { if (!cancelled) { setAll(list); } })
            .catch((err) => { if (!cancelled) setError(err.message); });
        return () => { cancelled = true; };
    }, [userAgent]);

    const view = useMemo(() => {
        if (!all) return [];
        return filterServers(all, { query, onlineOnly });
    }, [all, query, onlineOnly]);

    useEffect(() => { setSelected(0); }, [query, onlineOnly, all]);

    const visibleRows = Math.max(5, (stdout.rows || 24) - 8);

    useInput((input, key) => {
        if (key.escape || (key.ctrl && input === 'c')) { onCancel(); return; }
        if (key.tab) { setOnlineOnly((v) => !v); return; }
        if (key.ctrl && input === 'u') { setQuery(''); return; }
        if (key.return) {
            const picked = view[selected];
            if (picked) onPick(picked.url);
            return;
        }
        if (key.upArrow) { setSelected((i) => Math.max(0, i - 1)); return; }
        if (key.downArrow) { setSelected((i) => Math.min(view.length - 1, i + 1)); return; }
        if (key.pageUp) { setSelected((i) => Math.max(0, i - visibleRows)); return; }
        if (key.pageDown) { setSelected((i) => Math.min(view.length - 1, i + visibleRows)); return; }
        if (key.home) { setSelected(0); return; }
        if (key.end) { setSelected(view.length - 1); return; }
        if (key.backspace || key.delete) { setQuery((q) => q.slice(0, -1)); return; }
        if (input && input.length === 1 && !key.ctrl && !key.meta && input >= ' ') {
            setQuery((q) => q + input);
        }
    });

    if (error) {
        return (
            <Box flexDirection="column" padding={1}>
                <Text color={colors.bad}>Failed to fetch server list: {error}</Text>
                <Text dimColor>Press Esc to quit.</Text>
            </Box>
        );
    }

    if (!all) {
        return (
            <Box padding={1}>
                <Text color={colors.title}><Spinner type="dots" /></Text>
                <Text> Fetching public FM-DX server list…</Text>
            </Box>
        );
    }

    // Compute window of visible rows around selected
    const half = Math.floor(visibleRows / 2);
    const start = Math.max(0, Math.min(view.length - visibleRows, selected - half));
    const slice = view.slice(start, start + visibleRows);

    return (
        <Box flexDirection="column">
            <Box backgroundColor={colors.barBg} paddingX={1}>
                <Text color={colors.barFg} bold>
                    {`Public FM-DX servers — ${view.length} shown of ${all.length} total · ${onlineOnly ? 'online only' : 'all (incl. offline)'}`}
                </Text>
            </Box>
            <Box borderStyle="single" borderColor={colors.border} paddingX={1} flexDirection="column">
                <Text>
                    <Text color={colors.dim}>Search: </Text>
                    {query.length === 0 ? (
                        <Text color={colors.dim}>type to filter by name / city / country…</Text>
                    ) : (
                        <Text color={colors.value}>{query}</Text>
                    )}
                    <Text inverse> </Text>
                </Text>
            </Box>
            <Box borderStyle="single" borderColor={colors.border} flexDirection="column" flexGrow={1} paddingX={1}>
                {slice.length === 0 ? (
                    <Text dimColor>No matches.</Text>
                ) : (
                    slice.map((entry, i) => {
                        const idx = start + i;
                        const isSel = idx === selected;
                        const text = formatRow(entry);
                        return (
                            <Text
                                key={entry.url + idx}
                                backgroundColor={isSel ? colors.selectionBg : undefined}
                                color={isSel ? colors.selectionFg : 'white'}
                                bold={isSel}
                            >
                                {text}
                            </Text>
                        );
                    })
                )}
            </Box>
            <Box backgroundColor={colors.barBg} paddingX={1}>
                <Text color={colors.barFg}>
                    Enter=connect  ↑/↓=move  type=filter  Bksp=del  ^U=clear  Tab=toggle offline  Esc=cancel
                </Text>
            </Box>
        </Box>
    );
}
