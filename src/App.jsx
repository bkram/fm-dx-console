import React, { useEffect, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { Connection } from './lib/connection.js';
import { bandwidthProfile, AGC_OPTIONS } from './lib/profiles.js';
import useTerminalSize, { MIN_COLS, MIN_ROWS } from './lib/useTerminalSize.js';
import { colors } from './theme.js';
import { saveConfig } from './lib/config.js';

import ServerPicker from './components/ServerPicker.jsx';
import SelectList from './components/SelectList.jsx';
import HelpOverlay from './components/HelpOverlay.jsx';
import TextPrompt from './components/TextPrompt.jsx';
import AdvancedRds from './components/AdvancedRds.jsx';
import ServerInfo from './components/ServerInfo.jsx';
import TunerBox from './components/TunerBox.jsx';
import RdsBox from './components/RdsBox.jsx';
import StationBox from './components/StationBox.jsx';
import RtBox from './components/RtBox.jsx';
import ReceptionBox from './components/ReceptionBox.jsx';
import AudioBox from './components/AudioBox.jsx';
import TooSmall from './components/TooSmall.jsx';

function convertToFrequency(input) {
    if (input === null || input === undefined) return null;
    const s = String(input).trim().replace(',', '.');
    if (s === '') return null;
    let n = parseFloat(s);
    if (Number.isNaN(n)) return null;
    while (n >= 100) n /= 10;
    if (n < 76) n *= 10;
    return Math.round(n * 10) / 10;
}

// Float the modal at the centre of the screen. The main UI stays visible
// around it — only the cells inside the modal's own box are repainted
// (each modal component sets its own backgroundColor so its cells are
// opaque).
function ModalOverlay({ cols, rows, width, height, children }) {
    const w = Math.min(width || 40, cols - 2);
    const h = Math.min(height || 10, rows - 2);
    const top = Math.max(0, Math.floor((rows - h) / 2));
    const left = Math.max(0, Math.floor((cols - w) / 2));
    return (
        <Box position="absolute" top={top} left={left} width={w}>
            {children}
        </Box>
    );
}

export default function App({ initialUrl, userAgent, debug, autoPlay, initialSignalUnit }) {
    const { exit } = useApp();
    const { cols, rows } = useTerminalSize();
    const tooSmall = cols < MIN_COLS || rows < MIN_ROWS;
    const [url, setUrl] = useState(initialUrl || null);
    const [conn, setConn] = useState(null);
    const [data, setData] = useState(null);
    const [tunerInfo, setTunerInfo] = useState({ tunerName: '', tunerDesc: '', tunerType: '', antNames: ['Default'], activeAnt: 0 });
    const [rdsAdv, setRdsAdv] = useState(null);
    const [pingTime, setPingTime] = useState(null);
    const [audioPlaying, setAudioPlaying] = useState(false);
    const [volume, setVolume] = useState(100);
    const [levels, setLevels] = useState({ L: 0, R: 0 });
    const [holds, setHolds] = useState({ L: 0, R: 0 });
    const [signalUnit, setSignalUnit] = useState(initialSignalUnit || 'dBf');
    const [reconnect, setReconnect] = useState(null);  // { attempt, delayMs } or null
    const [modal, setModal] = useState(initialUrl ? null : 'picker');

    const cycleSignalUnit = () => {
        setSignalUnit((u) => {
            const next = u === 'dBf' ? 'dBuV' : u === 'dBuV' ? 'dBm' : 'dBf';
            saveConfig({ signalUnit: next });
            return next;
        });
    };

    // Create / replace connection when url changes
    useEffect(() => {
        if (!url) return;
        saveConfig({ lastUrl: url });
        const c = new Connection({ url, userAgent, debug });
        const onData = (d) => setData({ ...d });
        const onTuner = (t) => setTunerInfo({ ...t });
        const onRds = (r) => setRdsAdv(r);
        const onPing = (p) => setPingTime(p);
        const onAudio = (a) => setAudioPlaying(a);
        const onVolume = (v) => setVolume(v);
        const onLevel = ({ L, R }) => {
            setLevels({ L, R });
            setHolds((prev) => ({ L: Math.max(prev.L, L), R: Math.max(prev.R, R) }));
        };
        const onOpen = () => {
            setReconnect(null);
            if (autoPlay) c.startAudio();
        };
        const onReconnecting = (info) => setReconnect(info);
        c.on('data', onData);
        c.on('tunerinfo', onTuner);
        c.on('rds-advanced', onRds);
        c.on('ping', onPing);
        c.on('audio', onAudio);
        c.on('volume', onVolume);
        c.on('level', onLevel);
        c.on('open', onOpen);
        c.on('reconnecting', onReconnecting);
        setConn(c);
        setVolume(c.volume);
        return () => {
            c.off('data', onData);
            c.off('tunerinfo', onTuner);
            c.off('rds-advanced', onRds);
            c.off('ping', onPing);
            c.off('audio', onAudio);
            c.off('volume', onVolume);
            c.off('level', onLevel);
            c.off('open', onOpen);
            c.off('reconnecting', onReconnecting);
            c.disconnect();
        };
    }, [url, userAgent, debug, autoPlay]);

    // PPM-style ballistics: fast rise (immediate on incoming sample),
    // slow fall. Bar decays ~8%/100 ms; peak indicator ~3%/100 ms.
    useEffect(() => {
        const h = setInterval(() => {
            setLevels((prev) => ({
                L: prev.L > 0.001 ? prev.L * 0.92 : 0,
                R: prev.R > 0.001 ? prev.R * 0.92 : 0,
            }));
            setHolds((prev) => ({
                L: prev.L > 0.001 ? prev.L * 0.97 : 0,
                R: prev.R > 0.001 ? prev.R * 0.97 : 0,
            }));
        }, 100);
        return () => clearInterval(h);
    }, []);

    useInput((input, key) => {
        if (tooSmall) {
            if (key.escape || (key.ctrl && input === 'c') || input === 'q') exit();
            return;
        }
        if (modal) return;       // modal-only key handling
        if (!conn) return;

        // ESC at the top level exits. Inside a modal it falls back one level
        // (each modal handles its own escape → setModal(null) via onClose).
        if (key.escape || (key.ctrl && input === 'c')) { exit(); return; }
        if (key.leftArrow) { conn.tuneDelta(-100); return; }
        if (key.rightArrow) { conn.tuneDelta(+100); return; }
        if (key.upArrow) { conn.tuneDelta(+10); return; }
        if (key.downArrow) { conn.tuneDelta(-10); return; }

        switch (input) {
            case 'x': conn.tuneDelta(+1000); return;
            case 'z': conn.tuneDelta(-1000); return;
            case 'r': case 'R': conn.tuneToCurrent(); return;
            case 't': case 'T': setModal('freq'); return;
            case 'C': setModal('cmd'); return;
            case 'h': case 'H': setModal('help'); return;
            case 'p': case 'P': conn.toggleAudio(); return;
            case '[': conn.toggleIms(); return;
            case ']': conn.toggleEq(); return;
            case 'y': case 'Y': conn.cycleAntenna(); return;
            case 's': case 'S': setModal('server'); conn.refreshTunerInfo(); return;
            case 'a': case 'A': setModal('rdsAdv'); return;
            case 'b': case 'B': setModal('bandwidth'); return;
            case 'g': case 'G': setModal('agc'); return;
            case 'f': case 'F': conn.toggleForcedStereo(); return;
            case 'm': case 'M': setModal('picker'); return;
            case '+': case '=': conn.changeVolume(+5); return;
            case '-': case '_': conn.changeVolume(-5); return;
            case '0': conn.setVolume(0); return;
            case 'u': case 'U': cycleSignalUnit(); return;
        }
    });

    // --- Size gate ---
    if (tooSmall) return <TooSmall cols={cols} rows={rows} />;

    // --- Full-screen takeover modals (no background UI is appropriate) ---
    if (modal === 'picker') {
        return (
            <ServerPicker
                userAgent={userAgent}
                onPick={(newUrl) => { setModal(null); setUrl(newUrl); }}
                onCancel={() => {
                    if (!url) exit();
                    else setModal(null);
                }}
            />
        );
    }

    if (!conn || !url) {
        return <Box padding={1}><Text dimColor>Initialising…</Text></Box>;
    }

    // --- Build the overlay node (if any) so we can render it on top of the
    //     main UI rather than replacing it. ---
    let overlayNode = null;
    let overlayWidth = 50;
    let overlayHeight = 8;

    if (modal === 'help') {
        overlayWidth = 64;
        overlayHeight = 19;
        overlayNode = <HelpOverlay onClose={() => setModal(null)} />;
    } else if (modal === 'server') {
        overlayWidth = 70;
        overlayHeight = 12;
        overlayNode = <ServerInfo tunerInfo={tunerInfo} url={url} onClose={() => setModal(null)} />;
    } else if (modal === 'rdsAdv') {
        overlayWidth = 74;
        overlayHeight = 20;
        overlayNode = <AdvancedRds rds={rdsAdv || data} onClose={() => setModal(null)} />;
    } else if (modal === 'bandwidth') {
        const items = bandwidthProfile(tunerInfo.tunerType);
        const initialIndex = Math.max(0, items.findIndex((o) => o.value === Number(data?.bw || 0)));
        overlayWidth = 34;
        overlayHeight = Math.min(items.length + 6, 22);
        overlayNode = (
            <SelectList
                title={`Bandwidth (${tunerInfo.tunerType || 'tef'})`}
                items={items}
                initialIndex={initialIndex}
                onSelect={(it) => { conn.setBandwidth(it); setModal(null); }}
                onCancel={() => setModal(null)}
                width={34}
            />
        );
    } else if (modal === 'agc') {
        const initialIndex = Math.max(0, AGC_OPTIONS.findIndex((o) => o.value === Number(data?.agc || 0)));
        overlayWidth = 28;
        overlayHeight = AGC_OPTIONS.length + 6;
        overlayNode = (
            <SelectList
                title="AGC"
                items={AGC_OPTIONS}
                initialIndex={initialIndex}
                onSelect={(it) => { conn.setAgc(it.value); setModal(null); }}
                onCancel={() => setModal(null)}
                width={28}
            />
        );
    } else if (modal === 'freq') {
        overlayWidth = 48;
        overlayHeight = 8;
        overlayNode = (
            <TextPrompt
                label="Tune to frequency (MHz)"
                hint="e.g. 98.5"
                placeholder="MHz"
                onSubmit={(v) => {
                    const f = convertToFrequency(v);
                    if (f) conn.tune(f);
                    setModal(null);
                }}
                onCancel={() => setModal(null)}
            />
        );
    } else if (modal === 'cmd') {
        overlayWidth = 50;
        overlayHeight = 8;
        overlayNode = (
            <TextPrompt
                label="Send raw command"
                hint="e.g. T98500, Z1, G10, B0"
                onSubmit={(v) => { conn.sendRaw(v.trim()); setModal(null); }}
                onCancel={() => setModal(null)}
            />
        );
    }

    // --- Main layout (always rendered; overlay floats above) ---
    const users = data && data.users !== undefined ? String(data.users) : '—';
    const pingStr = pingTime !== null && pingTime !== undefined ? `${pingTime} ms` : '—';

    return (
        <Box flexDirection="column" width={cols} height={rows} position="relative" backgroundColor={colors.bg}>
            <Box backgroundColor={colors.topBarBg} paddingX={1}>
                <Box flexGrow={1}>
                    <Text color={colors.topBarFg} bold>
                        fm-dx-console · {tunerInfo.tunerName || url}{audioPlaying ? ' ♪' : ''}
                    </Text>
                </Box>
                {reconnect ? (
                    <Text color={colors.warn}>
                        reconnecting #{reconnect.attempt} in {Math.round(reconnect.delayMs / 1000)}s
                    </Text>
                ) : (
                    <Text color={colors.topBarFg}>
                        Users {users}   Ping {pingStr}
                    </Text>
                )}
            </Box>
            <Box flexGrow={1} backgroundColor={colors.bg}>
                <TunerBox data={data} tunerInfo={tunerInfo} />
                <RdsBox data={data} rdsAdv={rdsAdv} />
                <StationBox data={data} />
            </Box>
            <RtBox data={data} rdsAdv={rdsAdv} />
            <Box backgroundColor={colors.bg}>
                <ReceptionBox data={data} unit={signalUnit} />
                <AudioBox
                    audioPlaying={audioPlaying}
                    volume={volume}
                    levels={levels}
                    holds={holds}
                />
            </Box>
            <Box backgroundColor={colors.barBg} paddingX={1}>
                <Text color={colors.barFg}>
                    {url}   ·   press 'h' for help
                </Text>
            </Box>
            {overlayNode && (
                <ModalOverlay cols={cols} rows={rows} width={overlayWidth} height={overlayHeight}>
                    {overlayNode}
                </ModalOverlay>
            )}
        </Box>
    );
}
