import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const { version } = JSON.parse(await fs.readFile('package.json', 'utf8'));
const platform = process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : process.platform;
const files = (await fs.readdir('dist/releases')).filter(name => name.startsWith(`fm-dx-console-cli-${version}-${platform}-${process.arch}.`));
if (files.length !== 1) throw new Error(`Expected one CLI archive, found ${files.length}`);
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'fm dx cli smoke-'));
function run(command, args, options = {}) {
    const result = spawnSync(command, args, { encoding: 'utf8', timeout: 30000, ...options });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${command} failed (${result.status}): ${result.stderr}`);
    return result.stdout;
}
try {
    run('tar', ['-xf', path.resolve('dist/releases', files[0]), '-C', temporary]);
    const [name] = await fs.readdir(temporary);
    const bundle = path.join(temporary, name);
    const launcher = path.join(bundle, process.platform === 'win32' ? 'fm-dx-console.cmd' : 'fm-dx-console');
    const help = process.platform === 'win32'
        ? run(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `""${launcher}" --help"`],
            { windowsVerbatimArguments: true })
        : run(launcher, ['--help']);
    if (!help.includes('Usage: fm-dx-console') || !help.includes('25 connected servers')) {
        throw new Error('Packaged launcher did not show CLI help');
    }
    const runtime = path.join(bundle, 'runtime', process.platform === 'win32' ? 'node.exe' : 'node');
    const { node } = JSON.parse(await fs.readFile('packaging/runtime.json', 'utf8'));
    if (run(runtime, ['--version']).trim() !== `v${node}`) throw new Error('Incorrect bundled Node runtime');
    const code = `
        import { Worker } from 'node:worker_threads';
        import { pathToFileURL } from 'node:url';
        import path from 'node:path';
        const app = process.argv[1];
        const { Receiver } = await import(pathToFileURL(path.join(app, 'src/lib/receiver.js')));
        const { TerminalAudio } = await import(pathToFileURL(path.join(app, 'src/lib/terminal-audio.js')));
        if (typeof Receiver.prototype.action !== 'function' || typeof TerminalAudio !== 'function') throw new Error('Missing application modules');
        const rds = new Worker(path.join(app, 'src/workers/rds.cjs'));
        await new Promise((resolve, reject) => {
            rds.once('error', reject);
            rds.once('message', (data) => {
                if (data.type !== 'data' || data.pi !== '----') reject(new Error('Invalid RDS worker reply'));
                else resolve();
            });
            rds.postMessage({ type: 'getData' });
        });
        await rds.terminate();
        const audio = new Worker(path.join(app, 'src/workers/audio.cjs'), { workerData: {} });
        await new Promise((resolve, reject) => {
            audio.once('error', reject);
            audio.once('exit', (code) => code === 0 ? resolve() : reject(new Error('Audio worker exit ' + code)));
            audio.postMessage({ type: 'shutdown' });
        });
        console.log('Packaged connection and workers loaded');
    `;
    console.log(run(runtime, ['--input-type=module', '-e', code, path.join(bundle, 'app')]).trim());
    console.log(`CLI archive smoke test passed: ${files[0]}`);
} finally {
    await fs.rm(temporary, { recursive: true, force: true });
}
