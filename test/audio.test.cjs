const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createPlayback } = require('../src/audio/playback.cjs');

function harness(t) {
    const sockets = [];
    const children = [];
    const messages = [];
    class FakeSocket extends EventEmitter {
        constructor() { super(); sockets.push(this); }
        send() {}
        close() { process.nextTick(() => { this.emit('error', new Error('closed while connecting')); this.emit('close'); }); }
        terminate() {}
    }
    function spawn(command, args) {
        const child = new EventEmitter();
        child.command = command;
        child.args = args;
        child.stdin = new EventEmitter();
        child.stdin.writable = true;
        child.stdin.writableLength = 0;
        child.stdin.writes = [];
        child.stdin.write = (chunk) => child.stdin.writes.push(chunk);
        child.stdin.end = () => { child.stdin.writable = false; };
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.kill = () => { child.killed = true; return true; };
        children.push(child);
        return child;
    }
    const playback = createPlayback({ url: 'ws://example.com/audio', spawn, WebSocket: FakeSocket, onMessage: (msg) => messages.push(msg) });
    t.after(() => { playback.stop(); for (const child of children) child.emit('exit', 0); });
    return { playback, sockets, children, messages };
}

test('delayed old player exit after volume change does not detach replacement', (t) => {
    const { playback, sockets, children } = harness(t);
    playback.start();
    const oldPlayer = children[0];
    playback.setVolume(50);
    const replacement = children.at(-1);
    oldPlayer.emit('exit', 0);
    sockets[0].emit('message', Buffer.alloc(2048), true);
    assert.equal(replacement.stdin.writes.length, 1);
    assert.equal(oldPlayer.stdin.writes.length, 0);
    assert.equal(oldPlayer.killed, true);
    assert.ok(replacement.args.includes('50'));
});

test('old socket and meter events cannot affect restarted playback', async (t) => {
    const { playback, sockets, children } = harness(t);
    playback.start();
    playback.stop();
    playback.start();
    const replacementPlayer = children[2];
    const replacementMeter = children[3];
    children[0].emit('exit', 0);
    children[1].emit('exit', 0);
    sockets[0].emit('message', Buffer.alloc(2048), true);
    await new Promise((resolve) => setImmediate(resolve));
    sockets[1].emit('message', Buffer.alloc(2048), true);
    assert.equal(replacementPlayer.stdin.writes.length, 1);
    assert.equal(replacementMeter.stdin.writes.length, 1);
});

test('ffplay stdin failure stops playback and kills resources without unhandled errors', (t) => {
    const { playback, children, messages } = harness(t);
    playback.start();
    children[0].stdin.emit('error', new Error('EPIPE'));
    assert.equal(messages.at(-1).playing, false);
    assert.equal(children[0].killed, true);
    assert.equal(children[1].killed, true);
});
