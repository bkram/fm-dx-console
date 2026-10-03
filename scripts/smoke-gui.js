import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { createTunerServer } from '../test/helpers/tuner-server.js';

const candidates = process.platform === 'darwin'
    ? [`mac-${process.arch}`, 'mac'].map((folder) =>
        `dist/gui/${folder}/fm-dx-console-gui.app/Contents/MacOS/fm-dx-console-gui`)
    : [process.platform === 'win32' ? 'dist/gui/win-unpacked/fm-dx-console-gui.exe'
        : 'dist/gui/linux-unpacked/fm-dx-console-gui'];
let executable;
const source = process.argv.includes('--source');
for (const file of candidates) {
    try { await fs.access(file); executable = path.resolve(file); break; } catch { /* Try next platform path. */ }
}
if (source) {
    const { default: electron } = await import('electron');
    executable = electron;
}
if (!executable) throw new Error('Packaged GUI executable not found');
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'fm dx gui smoke-'));
const backend = await createTunerServer();
try {
    const report = path.join(temporary, 'report.json');
    const env = { ...process.env, FM_DX_SMOKE_REPORT: report,
        FM_DX_SMOKE_SERVER: backend.url, FM_DX_SMOKE_SWITCH_SERVER: backend.secondUrl };
    delete env.ELECTRON_RUN_AS_NODE;
    const args = process.argv.slice(2).filter(arg => arg !== '--source');
    if (source) args.unshift('.');
    await new Promise((resolve, reject) => {
        const child = spawn(executable, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
        let output = '';
        child.stdout.on('data', chunk => { output += chunk; });
        child.stderr.on('data', chunk => { output += chunk; });
        const timer = setTimeout(() => { child.kill(); reject(new Error(`GUI smoke timeout: ${output}`)); }, 60000);
        child.once('error', error => { clearTimeout(timer); reject(error); });
        child.once('exit', code => {
            clearTimeout(timer);
            if (code !== 0) reject(new Error(`GUI smoke test failed (${code}): ${output}`));
            else resolve();
        });
    });
    const state = JSON.parse(await fs.readFile(report, 'utf8'));
    const { version } = JSON.parse(await fs.readFile('package.json', 'utf8'));
    assert.equal(state.version, version);
    for (const name of ['fonts', 'connected', 'tuning', 'controls', 'rdsWorker', 'audio', 'selector', 'switching', 'disconnected']) {
        assert.equal(state[name], true, `${name} failed`);
    }
    const commands = backend.commands.filter(item => item.path.includes('/text')).map(item => item.command);
    for (const command of ['T99500', 'F', 'W72000', 'B1', 'G10', 'Z1']) assert.ok(commands.includes(command), `Missing ${command}: ${commands}`);
    assert.ok(!commands.some(command => /Infinity|NaN/.test(command)));
    assert.ok(backend.requests.includes('/Radio/static_data?token=AbC'));
    assert.ok(backend.requests.includes('/Second/static_data?token=XyZ'));
    assert.ok(backend.commands.some(item => item.path.includes('/audio') && item.command.includes('mp3')));
    console.log('GUI package smoke test passed:', JSON.stringify(state));
} finally {
    await backend.close();
    await fs.rm(temporary, { recursive: true, force: true });
}
