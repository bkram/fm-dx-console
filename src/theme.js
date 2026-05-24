// Classic Midnight Commander palette (matched against an actual MC screen):
//   deep blue canvas; cyan menu/status strips with black text; WHITE panel
//   borders; yellow bold for column titles and emphasised values; selection
//   highlighted as black-on-cyan.

export const colors = {
    // The famous MC blue, used by panels and modal canvases.
    bg: 'blue',

    // Panel chrome — MC borders are white on blue, not cyan.
    border: 'white',
    title: 'yellow',         // "Tuner", "RDS", "Station", ...

    // Top menu strip — cyan background, black text (MC menu bar).
    topBarBg: 'cyan',
    topBarFg: 'black',

    // Bottom status strip — same look.
    barBg: 'cyan',
    barFg: 'black',

    // Body text
    value: 'white',          // plain readings (PI, PS, …)
    freq: 'yellow',          // the big frequency reading
    selectionBg: 'cyan',     // currently-highlighted row in lists
    selectionFg: 'black',

    // Status states (kept conventional so meaning is obvious)
    ok: 'green',             // active, playing, strong signal
    warn: 'yellow',
    bad: 'red',              // mute, error, weak signal
    dim: 'gray',

    // Modal overlay — same blue canvas + white rim (MC dialog look).
    modalBg: 'blue',
    modalBorder: 'white',
    modalFg: 'white',
};
