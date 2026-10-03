import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const candidates = process.platform === 'darwin'
    ? ['mac', 'mac-arm64', 'mac-x64'].map((folder) =>
        `dist/gui/${folder}/fm-dx-console-gui.app/Contents/MacOS/fm-dx-console-gui`)
    : [process.platform === 'win32' ? 'dist/gui/win-unpacked/fm-dx-console-gui.exe'
        : 'dist/gui/linux-unpacked/fm-dx-console-gui'];
let executable;
for (const file of candidates) {
    try { await fs.access(file); executable = path.resolve(file); break; } catch { /* Try next platform path. */ }
}
if (!executable) throw new Error('Packaged GUI executable not found');
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'fm dx gui smoke-'));
try {
    const report = path.join(temporary, 'report.json');
    const env = { ...process.env, FM_DX_SMOKE_REPORT: report };
    delete env.ELECTRON_RUN_AS_NODE;
    const result = spawnSync(executable, process.argv.slice(2), { env, encoding: 'utf8', timeout: 30000 });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`GUI smoke test failed: ${result.stderr}`);
    const state = JSON.parse(await fs.readFile(report, 'utf8'));
    const { version } = JSON.parse(await fs.readFile('package.json', 'utf8'));
    if (state.version !== version || state.api !== 'object' || state.controls < 1 || !state.fonts) {
        throw new Error(`Invalid packaged GUI state: ${JSON.stringify(state)}`);
    }
    console.log('GUI package smoke test passed:', JSON.stringify(state));
} finally {
    await fs.rm(temporary, { recursive: true, force: true });
}
