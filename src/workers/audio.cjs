const { parentPort, workerData } = require('node:worker_threads');
const { createPlayback } = require('../audio/playback.cjs');
let shuttingDown = false;
const playback = createPlayback({
    ...workerData,
    onMessage: (message) => { if (!shuttingDown) parentPort.postMessage(message); },
});
parentPort.on('message', (message) => {
    if (message.type === 'start') playback.start();
    else if (message.type === 'stop') playback.stop();
    else if (message.type === 'setVolume') playback.setVolume(message.value);
    else if (message.type === 'shutdown') {
        shuttingDown = true;
        playback.stop();
        parentPort.close();
    }
});
