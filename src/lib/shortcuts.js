// UI-independent intentions. Each frontend translates modal/audio intentions
// into its own presentation; receiver actions use the same validated dispatcher.
export const SHORTCUTS = [
    { keys: ['ArrowLeft'], label: '←', description: 'decrease 0.1 MHz', action: 'tune-delta', value: -100 },
    { keys: ['ArrowRight'], label: '→', description: 'increase 0.1 MHz', action: 'tune-delta', value: 100 },
    { keys: ['ArrowDown'], label: '↓', description: 'decrease 0.01 MHz', action: 'tune-delta', value: -10 },
    { keys: ['ArrowUp'], label: '↑', description: 'increase 0.01 MHz', action: 'tune-delta', value: 10 },
    { keys: ['z'], description: 'decrease 1 MHz', action: 'tune-delta', value: -1000 },
    { keys: ['x'], description: 'increase 1 MHz', action: 'tune-delta', value: 1000 },
    { keys: ['r', 'R'], description: 'refresh / re-tune', action: 'retune' },
    { keys: ['t', 'T'], description: 'set frequency', modal: 'freq' },
    { keys: ['p', 'P'], description: 'toggle audio', audio: true },
    { keys: ['C'], description: 'send raw command', modal: 'cmd' },
    { keys: ['+', '='], label: '+/=', description: 'volume up', volume: 5 },
    { keys: ['-', '_'], description: 'volume down', volume: -5 },
    { keys: ['0'], description: 'mute', mute: true },
    { keys: ['['], description: 'toggle iMS', action: 'ims' },
    { keys: [']'], description: 'toggle EQ', action: 'eq' },
    { keys: ['y', 'Y'], description: 'cycle antenna', action: 'antenna' },
    { keys: ['f', 'F'], description: 'forced stereo', action: 'stereo' },
    { keys: ['s', 'S'], description: 'server info', modal: 'server' },
    { keys: ['a', 'A'], description: 'advanced RDS', modal: 'rdsAdv' },
    { keys: ['b', 'B'], description: 'bandwidth', modal: 'bandwidth' },
    { keys: ['g', 'G'], description: 'AGC (Si47xx)', modal: 'agc' },
    { keys: ['u', 'U'], description: 'cycle signal unit', signalUnit: true },
    { keys: ['m', 'M', 'Escape'], label: 'm / Esc', description: 'choose server / back', modal: 'recent' },
    { keys: ['h', 'H', '?'], description: 'help', modal: 'help' },
];
export function shortcutFor(key) { return SHORTCUTS.find(item => item.keys.includes(key)); }
