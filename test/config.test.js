import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { addRecentServer, validateConfig, createConfigStore } from '../src/lib/config.js';

test('legacy lastUrl migrates and corrupt settings use defaults', () => {
    assert.equal(validateConfig({ lastUrl: 'https://EXAMPLE.com/Radio' }).recentServers[0].url, 'https://example.com/Radio/');
    for (const value of [null, [], 123, { signalUnit: 'broken', lastUrl: 'file:///tmp' }]) {
        assert.deepEqual(validateConfig(value), { lastUrl: null, signalUnit: 'dBf', recentServers: [] });
    }
});

test('history retains 25 unique connections with newest first', () => {
    let config = {};
    for (let i = 0; i < 30; i++) config = addRecentServer(config, { url: `https://s${i}.example/`, name: `Server ${i}` }, i);
    assert.equal(config.recentServers.length, 25);
    assert.equal(config.recentServers.at(-1).url, 'https://s5.example/');
    config = addRecentServer(config, { url: 'https://S10.example' }, 99);
    assert.equal(config.recentServers.length, 25);
    assert.deepEqual(config.recentServers[0], { url: 'https://s10.example/', name: 'Server 10', connectedAt: 99 });
});

test('atomic persistence, rapid saves and restart preserve settings and history', async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'fmdx-config-'));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const filename = path.join(directory, 'config.json');
    await fs.writeFile(filename, '{broken');
    const errors = [];
    const store = createConfigStore(filename, (error) => errors.push(error));
    assert.equal(store.load().recentServers.length, 0);
    store.record({ url: 'http://one.example/' });
    const firstWrite = store.flush();
    store.save({ signalUnit: 'dBm' });
    store.record({ url: 'https://two.example/', name: 'Two' });
    store.updateName('http://one.example/', 'One');
    await Promise.all([firstWrite, store.flush()]);
    const restored = createConfigStore(filename).load();
    assert.equal(restored.signalUnit, 'dBm');
    assert.deepEqual(restored.recentServers.map((entry) => entry.name), ['Two', 'One']);
    assert.equal(errors.length, 0);
    assert.deepEqual(await fs.readdir(directory), ['config.json']);
});

test('configuration write failures are reported without throwing', async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'fmdx-config-error-'));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const errors = [];
    const store = createConfigStore(path.join(directory, 'missing', 'settings.json'), (error) => errors.push(error));
    store.save({ signalUnit: 'dBm' });
    await store.flush();
    assert.equal(errors.length, 1);
});
