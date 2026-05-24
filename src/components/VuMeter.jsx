import React from 'react';
import { Box, Text } from 'ink';

// `level` and `hold` are already on a 0..1 scale derived from a dB-linear
// mapping in the audio worker, so no extra curve is needed here.
function clamp01(v) {
    if (!v || v < 0) return 0;
    if (v > 1) return 1;
    return v;
}

// Colour the bar by segment: green / yellow / red — overlaid as a single
// Text with split spans for the right hue per third.
function ColoredBar({ level, hold, width }) {
    const v = clamp01(level);
    const h = clamp01(hold);
    const filled = Math.round(v * width);
    const holdIdx = Math.min(width - 1, Math.max(0, Math.round(h * width) - 1));
    const greenTo = Math.floor(width * 0.66);
    const yellowTo = Math.floor(width * 0.85);

    const parts = [];
    let acc = '';
    let curColor = 'green';
    const flush = (color) => { if (acc) { parts.push({ text: acc, color }); acc = ''; } };

    for (let i = 0; i < width; i++) {
        const ch = (i === holdIdx && holdIdx >= filled) ? '|' : (i < filled ? '█' : '░');
        const target = i < greenTo ? 'green' : (i < yellowTo ? 'yellow' : 'red');
        if (target !== curColor) { flush(curColor); curColor = target; }
        acc += ch;
    }
    flush(curColor);
    return (
        <Text>
            {parts.map((p, i) => <Text key={i} color={p.color}>{p.text}</Text>)}
        </Text>
    );
}

export default function VuMeter({ levels, holds, width = 12 }) {
    const L = (levels && levels.L) || 0;
    const R = (levels && levels.R) || 0;
    const HL = (holds && holds.L) || 0;
    const HR = (holds && holds.R) || 0;
    return (
        <>
            <Text wrap="truncate">
                L      <ColoredBar level={L} hold={HL} width={width} />
            </Text>
            <Text wrap="truncate">
                R      <ColoredBar level={R} hold={HR} width={width} />
            </Text>
        </>
    );
}
