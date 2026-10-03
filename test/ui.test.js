import test from 'node:test';
import http from 'node:http';
import { WebSocketServer } from 'ws';
import App from '../src/App.jsx';
import { addRecentServer, validateConfig } from '../src/lib/config.js';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import React from 'react';
import { render } from 'ink';
import RecentServers from '../src/components/RecentServers.jsx';
import TextPrompt from '../src/components/TextPrompt.jsx';

async function mount(t, element) {
    const stdout = new PassThrough();
    stdout.columns = 80;
    stdout.rows = 24;
    stdout.isTTY = true;
    const stdin = new PassThrough();
    stdin.isTTY = true;
    stdin.setRawMode = () => {};
    stdin.ref = stdin.unref = () => {};
    const stderr = new PassThrough();
    let output = '';
    stdout.on('data', (data) => { output += data.toString(); });
    stderr.on('data', (data) => { output += data.toString(); });
    const app = render(element, { stdout, stdin, stderr, debug: true, patchConsole: false, exitOnCtrlC: false });
    t.after(() => { app.unmount(); app.cleanup(); stdin.destroy(); stdout.destroy(); stderr.destroy(); });
    await delay(80);
    return { app, stdin, stdout, output: () => output, key: async (key) => { stdin.write(key); await delay(50); } };
}

test('recent selector filters, selects and scrolls all 25 servers in 80x24', async (t) => {
    const servers = Array.from({ length: 25 }, (_, index) => ({ name: `Station ${index}`, url: `https://s${index}.example/` }));
    const picks = [];
    let manual = 0;
    const ui = await mount(t, React.createElement(RecentServers, { servers, onPick: (url) => picks.push(url), onBrowse() {}, onManual: () => manual++, onCancel() {} }));
    assert.match(ui.output(), /Choose a server/);
    assert.ok(!ui.output().includes('Station 24'));
    await ui.key('\u001b[F'); // End selects manual URL even beyond visible rows.
    assert.match(ui.output(), /Station 24/);
    await ui.key('\r');
    assert.equal(manual, 1);
    await ui.key('Station 24');
    await ui.key('\r');
    assert.deepEqual(picks, ['https://s24.example/']);
});

test('empty history offers public browsing and manual URL entry', async (t) => {
    let browse = 0;
    let manual = 0;
    const ui = await mount(t, React.createElement(RecentServers, { servers: [], onPick() {}, onBrowse: () => browse++, onManual: () => manual++, onCancel() {} }));
    assert.match(ui.output(), /No recent servers yet/);
    await ui.key('\r');
    assert.equal(browse, 1);
    await ui.key('\u001b[B');
    await ui.key('\r');
    assert.equal(manual, 1);
});

test('text prompt shows validation errors and Escape cancels', async (t) => {
    let cancelled = 0;
    const ui = await mount(t, React.createElement(TextPrompt, { label: 'Frequency', onSubmit: () => 'Invalid frequency', onCancel: () => cancelled++ }));
    await ui.key('Infinity');
    await ui.key('\r');
    assert.match(ui.output(), /Invalid frequency/);
    await ui.key('\u001b');
    assert.equal(cancelled, 1);
});


test('startup opens selector and only successful connections enter history', async (t) => {
    let config = validateConfig({});
    const records = [];
    const settings = {
        load: () => config,
        save: (partial) => { config = { ...config, ...partial }; },
        record: (server) => { records.push(server.url); config = addRecentServer(config, server); },
        updateName: (url, name) => { config.recentServers = config.recentServers.map((entry) => entry.url === url ? { ...entry, name } : entry); },
    };
    const ui = await mount(t, React.createElement(App, { settings }));
    assert.match(ui.output(), /Choose a server/);
    const server = http.createServer((request, response) => {
        if (request.url === '/static_data') {
            response.setHeader('content-type', 'application/json');
            response.end(JSON.stringify({ tunerName: 'Local test' }));
        } else response.end('<html></html>');
    });
    const sockets = [];
    const wss = new WebSocketServer({ noServer: true });
    server.on('upgrade', (request, socket, head) => wss.handleUpgrade(request, socket, head, (client) => {
        sockets.push(client);
        if (request.url === '/text') client.send(JSON.stringify({ freq: 98.5, pi: 'ABCD' }));
    }));
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(async () => {
        for (const socket of sockets) socket.terminate();
        wss.close();
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
    });
    const url = `http://127.0.0.1:${server.address().port}/`;
    await ui.key('\u001b[B');
    await ui.key('\r'); // Manual URL
    assert.match(ui.output(), /Server URL/);
    await ui.key(url);
    await ui.key('\r');
    await delay(200);
    assert.deepEqual(records, [url]);
    assert.equal(config.recentServers[0].name, 'Local test');
    await ui.key('\u001b'); // Escape returns to the same startup selector.
    assert.match(ui.output(), /Local test/);
    await ui.key('\u001b[F'); // Manual URL
    await ui.key('\r');
    await ui.key('http://127.0.0.1:1/');
    await ui.key('\r');
    await delay(100);
    assert.deepEqual(records, [url]);
});
