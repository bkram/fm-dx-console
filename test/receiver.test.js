import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Receiver } from '../src/lib/receiver.js';
import { createConfigStore } from '../src/lib/config.js';
import { createTunerServer, waitFor } from './helpers/tuner-server.js';
import { stationRows } from '../src/lib/station.js';
import { parseSpectrumData } from '../src/lib/spectrum.js';
import { broadcastModel, formatGroups, advancedRdsModel, rtPlusLine } from '../src/lib/rds-display.js';
import { flagEnabled, convertSignal, cleanRdsText } from '../src/lib/display.js';

async function setup(t) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'fm-dx-receiver-'));
    const settings = createConfigStore(path.join(directory, 'settings.json'));
    const backend = await createTunerServer();
    const receiver = new Receiver({ settings, spectrum: true });
    t.after(async () => {
        receiver.disconnect(); await settings.flush(); await backend.close();
        await fs.rm(directory, { recursive: true, force: true });
    });
    receiver.connect(backend.url);
    await waitFor(() => receiver.connected && receiver.data && receiver.tunerInfo.tunerName === 'Test tuner');
    return { receiver, backend, settings };
}

test('shared receiver records successful history, loads RDS and preserves a connection on invalid input', async t => {
    const { receiver, backend, settings } = await setup(t);
    assert.equal(settings.load().recentServers[0].name, 'Test tuner');
    assert.equal(settings.load().recentServers[0].url, backend.url);
    await waitFor(() => receiver.rdsAdvanced?.pi === 'ABCD');
    assert.ok(Number(formatGroups(receiver.rdsAdvanced.groupStats)) > 0);
    assert.throws(() => receiver.connect('file:///etc/passwd'), /http/i);
    assert.equal(receiver.url, backend.url);
    assert.equal(receiver.connected, true);
    receiver.connect('http://127.0.0.1:1/');
    await delay(100);
    assert.equal(settings.load().recentServers.length, 1);
});

test('shared action dispatcher validates input and correctly toggles protocol string flags', async t => {
    const { receiver, backend } = await setup(t);
    for (const [type, value] of [['tune', Infinity], ['tune', '98.5junk'], ['bandwidth', 123], ['agc', 99], ['raw', ''], ['tune-delta', Infinity]]) {
        assert.throws(() => receiver.action(type, value));
    }
    assert.deepEqual(receiver.commandQueue, []);
    receiver.action('eq'); // string "0" is off
    receiver.action('ims');
    receiver.action('bandwidth', 72000);
    receiver.action('tune', '995');
    await waitFor(() => backend.commands.length >= 5);
    assert.deepEqual(backend.commands.filter(item => item.path.includes('/text')).map(item => item.command), ['G10', 'G11', 'F', 'W72000', 'T99500']);
    await waitFor(() => receiver.data.freq === 99.5);
    receiver.data.freq = 108;
    receiver.action('tune-delta', 100);
    await waitFor(() => backend.commands.some(item => item.command === 'T108000'));
    receiver.disconnect();
    assert.throws(() => receiver.action('tune', 98.5), /Connect/);
});

test('receiver switches servers without carrying spectrum requests, plugin retries or queued commands', async t => {
    const { receiver, backend, settings } = await setup(t);
    await waitFor(() => receiver.plugin?.readyState === 1);
    receiver.scanSpectrum();
    assert.ok((await receiver.spectrum()).sd);
    receiver.enqueue('T107000');
    receiver.connect(backend.secondUrl);
    await waitFor(() => receiver.tunerInfo.tunerName === 'Second tuner');
    assert.equal(settings.load().recentServers[0].url, backend.secondUrl);
    assert.equal(settings.load().recentServers.length, 2);
    await delay(200);
    assert.ok(!backend.commands.some(item => item.path.includes('/Second/') && item.command === 'T107000'));
    receiver.disconnect();
    assert.equal(receiver.plugin, null);
    assert.equal(receiver.pluginRetry, null);
    assert.equal(receiver.spectrumRequests, null);
    assert.equal(receiver._intervals.size, 0);
    assert.equal(receiver.audioUrl(), null);
});

test('shared RDS formatting handles the worker payload and cleans broadcast control characters', () => {
    const payload = { pty: 31, ps: ' TEST[0x00]\u0000 ', groupStats: [{ group: '0A', count: 4 }, { group: '2A', count: 3 }],
        rtPlusData: [{ contentType: 1, text: 'Song\r' }, { contentType: 4, text: 'Artist' }] };
    assert.equal(advancedRdsModel(payload).psClean, 'TEST');
    assert.equal(advancedRdsModel(payload).ptyDisplay, '31/Alarm');
    assert.equal(formatGroups(payload.groupStats), '7');
    assert.deepEqual(rtPlusLine(payload).song, { title: 'Song', artist: 'Artist' });
    assert.equal(cleanRdsText('A\u0000B'), 'AB');
    assert.equal(convertSignal(50, 'dBuV'), 38.75);
    assert.equal(flagEnabled('0'), false);
    assert.equal(flagEnabled('1'), true);
});


test('shared broadcast and transmitter models retain RT A/B, normalize AF and preserve zero values', () => {
    const model = broadcastModel({ pty: '1', rt0: 'Current', af: [98500, 99.5], ps: 'TEST' },
        { rtAbFlag: 'B', rtA: 'Previous', longPs: 'TEST FM' });
    assert.equal(model.rtA, 'Previous');
    assert.equal(model.rtB, 'Current');
    assert.equal(model.showLongPs, true);
    assert.equal(model.ptyDisplay, '1/News');
    assert.deepEqual(model.af, [98.5, 99.5]);
    const rows = stationRows({ txInfo: { tx: 'Test', dist: 0, azi: 0, erp: 0, score: 0 } });
    assert.equal(rows.find(row => row.label === 'Dist').value, '0 km');
    assert.equal(rows.find(row => row.label === 'Azim').value, '0°');
    assert.equal(rows.find(row => row.label === 'ERP').value, '0 kW');
    assert.deepEqual(parseSpectrumData('98500=55,bad=3,99500=NaN,=0,100000=0'), { '98.5': 55, '100': 0 });
});
