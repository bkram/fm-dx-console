const { parentPort, workerData } = require('worker_threads');
const { createRdsDecoder } = require('./rds-decoder');

const decoder = createRdsDecoder();

parentPort.on('message', (msg) => {
    if (msg.type === 'parse') {
        decoder.parseMessage(msg.data);
        parentPort.postMessage({ type: 'parsed' });
    } else if (msg.type === 'getData') {
        const state = decoder.getState();
        const stableFlags = decoder.getStableFlags();
        parentPort.postMessage({
            type: 'data',
            pi: state.currentPi,
            pty: state.pty,
            ptyName: decoder.getPtyName(),
            ps: decoder.getPs(),
            psStable: decoder.getPsStable(),
            longPs: decoder.getLongPs(),
            ptyn: decoder.getPtyn(),
            rt: decoder.getRt(),
            rtA: decoder.getRtA(),
            rtB: decoder.getRtB(),
            rtAbFlag: decoder.getRtAbFlag(),
            rtStable: decoder.getRtStable(),
            afList: decoder.getAfList(),
            afType: state.afType,
            ecc: state.ecc,
            lic: state.lic,
            pin: state.pin,
            localTime: state.localTime,
            utcTime: state.utcTime,
            tp: state.tp,
            ta: state.ta,
            ms: state.ms,
            diStereo: state.diStereo,
            diArtificialHead: state.diArtificialHead,
            diCompressed: state.diCompressed,
            diDynamicPty: state.diDynamicPty,
            hasRtPlus: state.hasRtPlus,
            hasEon: state.hasEon,
            hasTmc: state.hasTmc,
            hasOda: state.hasOda,
            eonData: decoder.getEonData(),
            odaList: decoder.getOdaList(),
            rtPlusData: decoder.getRtPlusData(),
            groupStats: decoder.getGroupStats(),
            ber: decoder.getBer(),
            stableFlags: stableFlags
        });
    }
});
