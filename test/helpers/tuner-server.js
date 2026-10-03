import http from 'node:http';
import fs from 'node:fs/promises';
import { WebSocketServer, WebSocket } from 'ws';
import { setTimeout as delay } from 'node:timers/promises';

export async function waitFor(predicate, timeout = 6000) {
    const deadline = Date.now() + timeout;
    while (!predicate()) {
        if (Date.now() > deadline) throw new Error('Timed out waiting for tuner state');
        await delay(20);
    }
}

// Real protocol fixture shared by receiver tests and packaged Electron checks.
// Use distinct case-sensitive base paths and queries to catch URL regressions.
export async function createTunerServer({ responseDelay = 0 } = {}) {
    const sockets = [];
    const commands = [];
    const requests = [];
    const audio = await fs.readFile(new URL('../fixtures/silence.mp3', import.meta.url));
    const state = { freq: 98.5, sig: 55, pi: 'ABCD', ps: 'TEST FM', pty: 1,
        tp: '0', ta: '0', st: '1', stForced: '0', eq: '0', ims: '0', ant: 0, bw: 64000, agc: 0, users: 1,
        rt0: 'Test radio <script>throw new Error("unsafe")</script>', rt1: '', txInfo: {} };
    const name = request => request.url.startsWith('/Second/') ? 'Second tuner' : 'Test tuner';
    const server = http.createServer((request, response) => {
        requests.push(request.url);
        setTimeout(() => {
            if (response.destroyed) return;
            if (request.url.includes('/static_data')) {
                response.setHeader('content-type', 'application/json');
                response.end(JSON.stringify({ tunerName: name(request), tunerDesc: 'Local receiver fixture', tuner: 'tef' }));
            } else if (request.url.includes('/spectrum-graph-plugin')) {
                response.setHeader('content-type', 'application/json');
                response.end(JSON.stringify({ sd: '98000=20,98500=55,99000=25' }));
            } else if (request.url.includes('/ping')) response.end('OK');
            else response.end('<html><div id="data-ant"><ul class="options"><li>Roof</li><li>Garden</li></ul></div></html>');
        }, responseDelay);
    });
    const wss = new WebSocketServer({ noServer: true });
    server.on('upgrade', (request, socket, head) => wss.handleUpgrade(request, socket, head, client => {
        const entry = { client, path: request.url };
        sockets.push(entry);
        if (request.url.includes('/text')) client.send(JSON.stringify(state));
        if (request.url.includes('/rds')) {
            const groups = ['ABCD040000005445', 'ABCD040100005354', 'ABCD040200002046', 'ABCD040300004D20'];
            client.send(groups.concat(groups, groups).join('\n'));
        }
        let audioTimer;
        client.on('message', message => {
            const command = message.toString();
            commands.push({ path: request.url, command });
            if (request.url.includes('/text')) {
                if (/^T\d+$/.test(command)) state.freq = Number(command.slice(1)) / 1000;
                if (/^W\d+$/.test(command)) state.bw = Number(command.slice(1));
                if (/^B[01]$/.test(command)) state.stForced = command.slice(1);
                if (/^G[01][01]$/.test(command)) { state.eq = command[1]; state.ims = command[2]; }
                if (/^Z\d+$/.test(command)) state.ant = Number(command.slice(1));
                client.send(JSON.stringify(state));
            }
            if (request.url.includes('/audio') && !audioTimer && command === JSON.stringify({ type: 'fallback', data: 'mp3' })) {
                client.send(audio);
                audioTimer = setInterval(() => { if (client.readyState === WebSocket.OPEN) client.send(audio); }, 1800);
            }
        });
        client.once('close', () => clearInterval(audioTimer));
    }));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    return {
        url: `${base}/Radio/?token=AbC`, secondUrl: `${base}/Second/?token=XyZ`, sockets, commands, requests,
        async close() {
            for (const { client } of sockets) client.terminate();
            wss.close(); server.closeAllConnections();
            await new Promise(resolve => server.close(resolve));
        }
    };
}
