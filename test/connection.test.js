import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocketServer } from 'ws';
import { Connection } from '../src/lib/connection.js';

async function waitFor(predicate, timeout = 4000) {
    const end = Date.now() + timeout;
    while (!predicate()) {
        if (Date.now() >= end) throw new Error('Timed out waiting for connection state');
        await delay(10);
    }
}
async function fixture(t, { name = 'Test', responseDelay = 0 } = {}) {
    const sockets = [];
    const commands = [];
    const server = http.createServer((request, response) => {
        setTimeout(() => {
            if (request.url.includes('static_data')) {
                response.setHeader('content-type', 'application/json');
                response.end(JSON.stringify({ tunerName: name }));
            } else response.end('<html></html>');
        }, responseDelay);
    });
    const wss = new WebSocketServer({ noServer: true });
    server.on('upgrade', (request, socket, head) => {
        wss.handleUpgrade(request, socket, head, (client) => {
            sockets.push({ client, path: request.url });
            client.on('message', (message) => commands.push(message.toString()));
        });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(async () => {
        for (const { client } of sockets) client.terminate();
        wss.close();
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
    });
    return { url: `http://127.0.0.1:${server.address().port}/Radio/?token=AbC`, sockets, commands };
}

test('disconnecting CONNECTING sockets does not crash or leave timers and workers', async () => {
    const connection = new Connection();
    connection.connect('http://127.0.0.1:1/');
    connection.enqueue('T98500');
    connection.disconnect();
    connection.disconnect();
    await delay(100);
    assert.equal(connection.ws, null);
    assert.equal(connection.rdsWorker, null);
    assert.equal(connection._intervals.size, 0);
    assert.equal(connection._reconnectTimer, null);
    assert.deepEqual(connection.commandQueue, []);
});

test('RDS-only failure recovers without reconnecting control and disconnect cancels retry', async (t) => {
    const backend = await fixture(t);
    const connection = new Connection();
    t.after(() => connection.disconnect());
    connection.connect(backend.url);
    await waitFor(() => backend.sockets.length === 2);
    const control = connection.ws;
    backend.sockets.find((entry) => entry.path.includes('/rds')).client.close();
    await waitFor(() => backend.sockets.length === 3);
    assert.equal(connection.ws, control);
    assert.ok(connection.rdsWorker);
    assert.equal(connection._intervals.size, 3); // ping, command pump and RDS polling
    connection.rdsWs.close();
    await waitFor(() => connection._rdsReconnectTimer !== null);
    connection.disconnect();
    assert.equal(connection._rdsReconnectTimer, null);
    await delay(1100);
    assert.equal(backend.sockets.length, 3);
});

test('control reconnect emits unchanged initial snapshot again and leaves one RDS worker', async (t) => {
    const backend = await fixture(t);
    const connection = new Connection();
    t.after(() => connection.disconnect());
    const snapshots = [];
    connection.on('data', (data) => snapshots.push(data));
    connection.connect(backend.url);
    await waitFor(() => backend.sockets.length === 2);
    const main = backend.sockets.find((entry) => entry.path.includes('/text')).client;
    const payload = JSON.stringify({ freq: 98.5, pi: 'ABCD' });
    main.send(payload);
    main.send(payload);
    await waitFor(() => snapshots.length === 1);
    main.close();
    await waitFor(() => backend.sockets.length === 4);
    backend.sockets.filter((entry) => entry.path.includes('/text')).at(-1).client.send(payload);
    await waitFor(() => snapshots.length === 2);
    assert.equal(connection._intervals.size, 3);
});

test('switching servers drops queued commands and ignores late HTTP metadata and ping', async (t) => {
    const oldBackend = await fixture(t, { name: 'Old', responseDelay: 200 });
    const newBackend = await fixture(t, { name: 'New' });
    const connection = new Connection();
    t.after(() => connection.disconnect());
    connection.connect(oldBackend.url);
    await waitFor(() => oldBackend.sockets.length === 2);
    connection.enqueue('T98500');
    connection.connect(newBackend.url);
    await waitFor(() => connection.tunerInfo.tunerName === 'New' && connection.pingTime !== null);
    await delay(300);
    assert.equal(connection.tunerInfo.tunerName, 'New');
    assert.deepEqual(newBackend.commands, []);
    assert.equal(connection._intervals.size, 3);
});
