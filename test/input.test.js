import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFrequency } from '../src/lib/frequency.js';
import { normalizeUrl, isValidURL, endpointUrl } from '../src/lib/urls.js';
import { Connection } from '../src/lib/connection.js';
import { parseOptions } from '../src/lib/cli-options.js';

test('frequency parser rejects infinite and malformed input and preserves precision', () => {
    for (const input of ['Infinity', '1e309', '98.5oops', '', null, '-98.5', '63', '109', '99999999999999999999999']) {
        assert.equal(parseFrequency(input), null, String(input));
    }
    for (const [input, expected] of [['98.51', 98.51], ['98,5', 98.5], ['985', 98.5], ['98500', 98.5], ['1053', 105.3], ['1080', 108], ['10.5', 105], ['108', 108], ['65.9', 65.9], ['9.85', 98.5]]) {
        assert.equal(parseFrequency(input), expected);
    }
});

test('server URLs preserve path and query casing and append endpoints correctly', () => {
    assert.equal(normalizeUrl(' https://EXAMPLE.com/Radio?token=AbC#top '), 'https://example.com/Radio/?token=AbC');
    assert.equal(endpointUrl('https://example.com/Radio/?token=AbC', 'text', true), 'wss://example.com/Radio/text?token=AbC');
    assert.equal(normalizeUrl('http://example.com///'), 'http://example.com/');
    for (const url of ['file:///tmp/radio', 'ftp://example.com', 'ws://example.com', 'bad']) assert.equal(isValidURL(url), false);
});

test('no URL opens selector, --no-resume parses correctly, explicit URL connects directly', () => {
    assert.equal(parseOptions([]).initialUrl, null);
    assert.equal(parseOptions(['--no-resume']).resume, false);
    assert.equal(parseOptions(['--no-resume']).initialUrl, null);
    assert.equal(parseOptions(['--url', 'https://EXAMPLE.com/Radio']).initialUrl, 'https://example.com/Radio/');
    assert.throws(() => parseOptions(['--url', 'file:///tmp/radio']));
});


test('antenna cycling uses the active connection and available tuner antennas', () => {
    const connection = new Connection();
    connection.tunerInfo.antNames = ['V', 'H'];
    connection.data = { ant: '0' };
    connection.cycleAntenna();
    assert.equal(connection.data.ant, 1);
    connection.cycleAntenna();
    assert.equal(connection.data.ant, 0);
    assert.deepEqual(connection.commandQueue, ['Z1', 'Z0']);
    connection.tunerInfo.antNames = [];
    connection.cycleAntenna();
    assert.equal(connection.data.ant, 0);
    connection.disconnect();
});
