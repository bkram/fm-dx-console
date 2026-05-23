import React, { useEffect, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { Connection } from './lib/connection.js';
import { bandwidthProfile, AGC_OPTIONS } from './lib/profiles.js';

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
import SignalBox from './components/SignalBox.jsx';
import StatsBox from './components/StatsBox.jsx';

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

export default function App({ initialUrl, userAgent, debug, autoPlay }) {
    const { exit } = useApp();
    const [url, setUrl] = useState(initialUrl || null);
    const [conn, setConn] = useState(null);
    const [data, setData] = useState(null);
    const [tunerInfo, setTunerInfo] = useState({ tunerName: '', tunerDesc: '', tunerType: '', antNames: ['Default'], activeAnt: 0 });
    const [rdsAdv, setRdsAdv] = useState(null);
    const [pingTime, setPingTime] = useState(null);
    const [audioPlaying, setAudioPlaying] = useState(false);
    const [modal, setModal] = useState(initialUrl ? null : 'picker');

    // Create / replace connection when url changes
    useEffect(() => {
        if (!url) return;
        const c = new Connection({ url, userAgent, debug });
        const onData = (d) => setData({ ...d });
        const onTuner = (t) => setTunerInfo({ ...t });
        const onRds = (r) => setRdsAdv(r);
        const onPing = (p) => setPingTime(p);
        const onAudio = (a) => setAudioPlaying(a);
        const onOpen = () => { if (autoPlay) c.startAudio(); };
        c.on('data', onData);
        c.on('tunerinfo', onTuner);
        c.on('rds-advanced', onRds);
        c.on('ping', onPing);
        c.on('audio', onAudio);
        c.on('open', onOpen);
        setConn(c);
        return () => {
            c.off('data', onData);
            c.off('tunerinfo', onTuner);
            c.off('rds-advanced', onRds);
            c.off('ping', onPing);
            c.off('audio', onAudio);
            c.off('open', onOpen);
            c.disconnect();
        };
    }, [url, userAgent, debug, autoPlay]);

    useInput((input, key) => {
        if (modal) return;       // modal-only key handling
        if (!conn) return;

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
        }
    });

    // --- Modal renderers ---

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

    if (modal === 'help') return <HelpOverlay onClose={() => setModal(null)} />;
    if (modal === 'server') return <ServerInfo tunerInfo={tunerInfo} url={url} onClose={() => setModal(null)} />;
    if (modal === 'rdsAdv') return <AdvancedRds rds={rdsAdv || data} onClose={() => setModal(null)} />;

    if (modal === 'bandwidth') {
        const items = bandwidthProfile(tunerInfo.tunerType);
        const initialIndex = Math.max(0, items.findIndex((o) => o.value === Number(data?.bw || 0)));
        return (
            <Box flexDirection="column" alignItems="center" paddingTop={2}>
                <SelectList
                    title={`Bandwidth (${tunerInfo.tunerType || 'tef'})`}
                    items={items}
                    initialIndex={initialIndex}
                    onSelect={(it) => { conn.setBandwidth(it); setModal(null); }}
                    onCancel={() => setModal(null)}
                    width={32}
                />
            </Box>
        );
    }

    if (modal === 'agc') {
        const initialIndex = Math.max(0, AGC_OPTIONS.findIndex((o) => o.value === Number(data?.agc || 0)));
        return (
            <Box flexDirection="column" alignItems="center" paddingTop={2}>
                <SelectList
                    title="AGC"
                    items={AGC_OPTIONS}
                    initialIndex={initialIndex}
                    onSelect={(it) => { conn.setAgc(it.value); setModal(null); }}
                    onCancel={() => setModal(null)}
                    width={28}
                />
            </Box>
        );
    }

    if (modal === 'freq') {
        return (
            <Box flexDirection="column" alignItems="center" paddingTop={2}>
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
            </Box>
        );
    }

    if (modal === 'cmd') {
        return (
            <Box flexDirection="column" alignItems="center" paddingTop={2}>
                <TextPrompt
                    label="Send raw command"
                    hint="e.g. T98500, Z1, G10, B0"
                    onSubmit={(v) => { conn.sendRaw(v.trim()); setModal(null); }}
                    onCancel={() => setModal(null)}
                />
            </Box>
        );
    }

    // --- Main layout ---

    return (
        <Box flexDirection="column" height="100%">
            <Box backgroundColor="green" paddingX={1}>
                <Text color="black" bold>
                    fm-dx-console · {tunerInfo.tunerName || url}{audioPlaying ? ' · ♪' : ''}
                </Text>
            </Box>
            <Box>
                <TunerBox data={data} tunerInfo={tunerInfo} audioPlaying={audioPlaying} />
                <RdsBox data={data} />
                <StationBox data={data} />
            </Box>
            <RtBox data={data} />
            <Box>
                <SignalBox data={data} />
                <StatsBox data={data} pingTime={pingTime} />
            </Box>
            <Box backgroundColor="green" paddingX={1}>
                <Text color="black">
                    {url}   ·   press 'h' for help
                </Text>
            </Box>
        </Box>
    );
}
