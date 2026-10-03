import { flagEnabled } from '../lib/display.js';
import React from 'react';
import { Box, Text, useInput } from 'ink';
import { advancedRdsModel, s, summariseAf, timeOnly, diLine, stableLine, formatGroups } from '../lib/rds-display.js';
import { colors } from '../theme.js';

// Label is on the modal's blue bg — use cyan, not gray, so it stays readable.
const Lbl = ({ w = 7, children }) => <Text color={colors.title}>{String(children).padEnd(w)}</Text>;
const Val = ({ children }) => <Text color={colors.value}>{children}</Text>;

export default function AdvancedRds({ rds, onClose }) {
    useInput((input, key) => {
        if (key.escape || input === 'a' || input === 'A' || (key.ctrl && input === 'c')) onClose();
    });

    const { d, ptyDisplay, longPs, ptyn, rtA, rtB, psClean, eon, rtPlusLines, odaList, indicators } = advancedRdsModel(rds);

    return (
        <Box
            flexDirection="column"
            borderStyle="single"
            borderColor={colors.modalBorder}
            paddingX={2}
            width={74}
            backgroundColor={colors.modalBg}
            borderBackgroundColor={colors.modalBg}
        >
            <Text bold color={colors.title}>Advanced RDS</Text>
            <Text> </Text>

            <Text wrap="truncate"><Lbl>PI</Lbl><Val>{s(d.pi)}</Val>   <Lbl>PS</Lbl><Val>{psClean}</Val>   <Lbl>PTY</Lbl>{ptyDisplay}</Text>
            <Text wrap="truncate"><Lbl>LongPS</Lbl><Val>{longPs}</Val></Text>
            <Text wrap="truncate"><Lbl>PTYN</Lbl><Val>{ptyn}</Val></Text>
            <Text wrap="truncate"><Lbl>RT-A</Lbl>{rtA}</Text>
            <Text wrap="truncate"><Lbl>RT-B</Lbl>{rtB}</Text>
            <Text> </Text>

            <Text wrap="truncate">
                <Lbl>Flags</Lbl>
                <Text color={flagEnabled(d.tp) ? colors.ok : colors.modalFg}>TP </Text>
                <Text color={flagEnabled(d.ta) ? colors.ok : colors.modalFg}>TA </Text>
                <Text>  M/S {d.ms == 1 ? 'M' : d.ms == 0 ? 'S' : '—'}   DI {diLine(d)}</Text>
            </Text>
            <Text wrap="truncate"><Lbl>Stable</Lbl>{stableLine(d.stableFlags)}</Text>
            <Text wrap="truncate"><Lbl>Time</Lbl>{timeOnly(d.localTime)}   UTC {timeOnly(d.utcTime)}</Text>
            <Text wrap="truncate"><Lbl>Country</Lbl>ECC {s(d.ecc)}   LIC {s(d.lic)}   PIN {s(d.pin)}</Text>
            <Text wrap="truncate"><Lbl>AF</Lbl>{summariseAf(d.afList || d.af, d.afType)}</Text>
            {rtPlusLines.map((pair, idx) => (
                <Text key={`rtp${idx}`} wrap="truncate">
                    {idx === 0 ? <Lbl>RT+</Lbl> : <Text>       </Text>}
                    {pair.map((it, i) => (
                        <Text key={i}>
                            {i > 0 ? <Text dimColor>   ·   </Text> : null}
                            <Text color={colors.title}>{it.label}: </Text>
                            <Val>{it.text}</Val>
                        </Text>
                    ))}
                </Text>
            ))}
            {eon && <Text wrap="truncate"><Lbl>EON</Lbl>{eon}</Text>}
            {odaList.length > 0 && (
                <Text wrap="truncate"><Lbl>ODA</Lbl>{odaList.map((o) => o.app || o.name || o.aid || '?').join(', ')}</Text>
            )}
            {indicators.length > 0 && (
                <Text wrap="truncate"><Lbl>Has</Lbl><Text color={colors.ok}>{indicators.join(' ')}</Text></Text>
            )}
            <Text wrap="truncate"><Lbl>BER</Lbl>{d.ber !== undefined && d.ber !== null ? `${d.ber}` : '—'}   <Lbl w={7}>Groups</Lbl>{formatGroups(d.groupStats)}</Text>
            <Text> </Text>

            <Text color={colors.title}>(press a or Esc to close)</Text>
        </Box>
    );
}
