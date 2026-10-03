import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { TerminalAudio } from '../src/lib/terminal-audio.js';

class FakeWorker extends EventEmitter {
    constructor(path, options) { super(); this.path = path; this.options = options; this.messages = []; }
    postMessage(message) { this.messages.push(message); }
    terminate() { this.emit('exit', 0); return Promise.resolve(); }
}

test('terminal audio uses the supplied receiver URL and ignores events from a retired worker', () => {
    let url = null;
    const output = new TerminalAudio({ getUrl: () => url, WorkerType: FakeWorker });
    const levels = [];
    output.on('level', value => levels.push(value));
    output.startAudio();
    assert.equal(output.audioWorker, null);
    url = 'ws://example.org/Radio/audio?token=AbC';
    output.setVolume(20);
    output.startAudio();
    const old = output.audioWorker;
    assert.equal(old.options.workerData.url, url);
    assert.equal(old.options.workerData.volume, 20);
    output.shutdown();
    assert.equal(old.messages.at(-1).type, 'shutdown');
    output.startAudio();
    const replacement = output.audioWorker;
    old.emit('message', { type: 'audio', playing: false });
    old.emit('message', { type: 'level', L: 1, R: 1 });
    old.emit('exit', 0);
    assert.equal(output.audioWorker, replacement);
    assert.equal(output.audioPlaying, true);
    assert.deepEqual(levels, []);
    output.changeVolume(1000);
    assert.equal(output.volume, 100);
    assert.deepEqual(replacement.messages.at(-1), { type: 'setVolume', value: 100 });
    output.stopAudio();
    assert.equal(output.audioPlaying, false);
    output.shutdown();
    replacement.emit('exit', 0);
});
