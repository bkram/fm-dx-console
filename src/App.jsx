import React, { useEffect, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { TerminalAudio } from './lib/terminal-audio.js';
import { Receiver } from './lib/receiver.js';
import { bandwidthProfile, AGC_OPTIONS } from './lib/profiles.js';
import useTerminalSize, { MIN_COLS, MIN_ROWS } from './lib/useTerminalSize.js';
import { colors } from './theme.js';
import { defaultSettings } from './lib/config.js';
import { parseFrequency } from './lib/frequency.js';
import { normalizeUrl } from './lib/urls.js';
import { shortcutFor } from './lib/shortcuts.js';
import { nextSignalUnit } from './lib/display.js';
import RecentServers from './components/RecentServers.jsx';

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

export default function App({ initialUrl, userAgent, debug, autoPlay, initialSignalUnit, settings = defaultSettings }) {
    const { exit } = useApp();
    const { cols, rows } = useTerminalSize();
    const tooSmall = cols < MIN_COLS || rows < MIN_ROWS;
    const [url, setUrl] = useState(initialUrl || null);
    const [conn, setConn] = useState(null);
    const [audio, setAudio] = useState(null);
    const [data, setData] = useState(null);
    const [tunerInfo, setTunerInfo] = useState({ tunerName: '', tunerDesc: '', tunerType: '', antNames: ['Default'], activeAnt: 0 });
    const [rdsAdv, setRdsAdv] = useState(null);
    const [pingTime, setPingTime] = useState(null);
    const [audioPlaying, setAudioPlaying] = useState(false);
    const [volume, setVolume] = useState(100);
    const [levels, setLevels] = useState({ L: 0, R: 0 });
    const [holds, setHolds] = useState({ L: 0, R: 0 });
    const [signalUnit, setSignalUnit] = useState(initialSignalUnit || 'dBf');
    const [actionError, setActionError] = useState('');
    const runAction = (type, value) => {
        try { conn.action(type, value); setActionError(''); return true; }
        catch (error) { setActionError(error.message); return false; }
    };
    const [reconnect, setReconnect] = useState(null);  // { attempt, delayMs } or null
    const [modal, setModal] = useState(initialUrl ? null : 'recent');

    const cycleSignalUnit = () => {
        setSignalUnit((u) => {
            const next = nextSignalUnit(u);
            settings.save({ signalUnit: next });
            return next;
        });
    };

    // Create / replace connection when url changes
    useEffect(() => {
        if (!url) return;
        setData(null);
        setRdsAdv(null);
        setPingTime(null);
        setTunerInfo({ tunerName: '', tunerDesc: '', tunerType: '', antNames: ['Default'], activeAnt: 0 });
        setAudioPlaying(false);
        setLevels({ L: 0, R: 0 });
        setHolds({ L: 0, R: 0 });
        setReconnect(null);
        const c = new Receiver({ userAgent, debug, settings });
        const a = new TerminalAudio({ getUrl: () => c.audioUrl(), userAgent, debug });
        const onData = (d) => setData({ ...d });
        const onTuner = (t) => {
            setTunerInfo({ ...t });
        };
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
            if (autoPlay && !a.audioPlaying) a.startAudio();
        };
        const onReconnecting = (info) => setReconnect(info);
        c.on('data', onData);
        c.on('tunerinfo', onTuner);
        c.on('rds-advanced', onRds);
        c.on('ping', onPing);
        a.on('audio', onAudio);
        a.on('volume', onVolume);
        a.on('level', onLevel);
        c.on('open', onOpen);
        c.on('reconnecting', onReconnecting);
        setConn(c);
        setAudio(a);
        setVolume(a.volume);
        c.connect(url);
        return () => {
            c.off('data', onData);
            c.off('tunerinfo', onTuner);
            c.off('rds-advanced', onRds);
            c.off('ping', onPing);
            a.off('audio', onAudio);
            a.off('volume', onVolume);
            a.off('level', onLevel);
            c.off('open', onOpen);
            c.off('reconnecting', onReconnecting);
            a.shutdown();
            c.disconnect();
        };
    }, [url, userAgent, debug, autoPlay, settings]);

    // PPM-style ballistics: fast rise (immediate on incoming sample),
    // slow fall. Bar decays ~8%/100 ms; peak indicator ~3%/100 ms.
    // Return the previous reference when nothing changed so React skips the
    // re-render (otherwise this interval would force a redraw 10×/sec while
    // levels are already at zero).
    useEffect(() => {
        const h = setInterval(() => {
            setLevels((prev) => {
                const L = prev.L > 0.001 ? prev.L * 0.92 : 0;
                const R = prev.R > 0.001 ? prev.R * 0.92 : 0;
                return L === prev.L && R === prev.R ? prev : { L, R };
            });
            setHolds((prev) => {
                const L = prev.L > 0.001 ? prev.L * 0.97 : 0;
                const R = prev.R > 0.001 ? prev.R * 0.97 : 0;
                return L === prev.L && R === prev.R ? prev : { L, R };
            });
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

        if (key.ctrl && input === 'c') { exit(); return; }
        const name = key.escape ? 'Escape' : key.leftArrow ? 'ArrowLeft' : key.rightArrow ? 'ArrowRight'
            : key.upArrow ? 'ArrowUp' : key.downArrow ? 'ArrowDown' : input;
        const shortcut = shortcutFor(name);
        if (!shortcut) return;
        if (shortcut.action) runAction(shortcut.action, shortcut.value);
        else if (shortcut.modal) {
            setModal(shortcut.modal);
            if (shortcut.modal === 'server') conn.refreshTunerInfo();
        } else if (shortcut.audio) audio?.toggleAudio();
        else if (shortcut.volume) audio?.changeVolume(shortcut.volume);
        else if (shortcut.mute) audio?.setVolume(0);
        else if (shortcut.signalUnit) cycleSignalUnit();
    });

    // --- Size gate ---
    if (tooSmall) return <TooSmall cols={cols} rows={rows} />;

    // --- Full-screen takeover modals (no background UI is appropriate) ---
    const pickServer = (newUrl) => {
        const canonical = normalizeUrl(newUrl);
        setUrl(canonical);
        setModal(null);
    };
    if (modal === 'recent') {
        return <RecentServers servers={settings.load().recentServers} onPick={pickServer}
            onBrowse={() => setModal('picker')} onManual={() => setModal('url')}
            onCancel={() => { if (!url) exit(); else setModal(null); }} />;
    }
    if (modal === 'url') {
        return <Box padding={1}><TextPrompt label="Server URL" hint="e.g. https://your-server/"
            onSubmit={(value) => {
                try { pickServer(value); } catch { return 'Enter a valid http:// or https:// URL.'; }
            }} onCancel={() => setModal('recent')} /></Box>;
    }

    if (modal === 'picker') {
        return (
            <ServerPicker
                userAgent={userAgent}
                onPick={pickServer}
                onCancel={() => {
                    setModal('recent');
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
                onSelect={(it) => { runAction('bandwidth', it.value); setModal(null); }}
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
                onSelect={(it) => { runAction('agc', it.value); setModal(null); }}
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
                    const f = parseFrequency(v);
                    if (f === null) return 'Enter a frequency from 64 to 108 MHz.';
                    if (!runAction('tune', f)) return 'Connect to a server first.';
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
                onSubmit={(v) => { if (runAction('raw', v.trim())) setModal(null); else return 'Cannot send command. Connect first and enter a valid command.'; }}
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
                    {actionError || `${url}   ·   press 'h' for help`}
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
