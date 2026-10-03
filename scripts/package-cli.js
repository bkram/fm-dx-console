import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const metadata = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const { node: version } = JSON.parse(await fs.readFile(path.join(root, 'packaging/runtime.json'), 'utf8'));
const { platform, arch } = process;
if (!['darwin', 'linux', 'win32'].includes(platform) || !['x64', 'arm64'].includes(arch)) {
    throw new Error(`Unsupported release target: ${platform}-${arch}`);
}
const target = `${platform === 'win32' ? 'windows' : platform === 'darwin' ? 'macos' : platform}-${arch}`;
const name = `fm-dx-console-cli-${metadata.version}-${target}`;
const output = path.join(root, 'dist/releases');
const stage = await fs.mkdtemp(path.join(os.tmpdir(), 'fm-dx-cli-package-'));

function run(command, args, options = {}) {
    const result = spawnSync(command, args, { stdio: 'inherit', ...options });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`);
}
async function download(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error(`Download failed: ${response.status} ${url}`);
    return Buffer.from(await response.arrayBuffer());
}
try {
    const bundle = path.join(stage, name);
    await fs.mkdir(path.join(bundle, 'runtime'), { recursive: true });
    await fs.cp(path.join(root, 'dist/cli/app'), path.join(bundle, 'app'), { recursive: true });
    const distribution = `node-v${version}-${platform === 'win32' ? 'win' : platform}-${arch}`;
    const filename = `${distribution}.${platform === 'win32' ? 'zip' : 'tar.gz'}`;
    const base = `https://nodejs.org/dist/v${version}/`;
    const checksums = (await download(base + 'SHASUMS256.txt')).toString();
    const expected = checksums.split('\n').map((line) => line.trim().split(/\s+/))
        .find(([, file]) => file === filename)?.[0];
    if (!expected) throw new Error(`Missing official Node checksum for ${filename}`);
    const archive = await download(base + filename);
    if (createHash('sha256').update(archive).digest('hex') !== expected) {
        throw new Error('Node runtime checksum mismatch');
    }
    const archivePath = path.join(stage, filename);
    await fs.writeFile(archivePath, archive);
    run('tar', ['-xf', archivePath, '-C', stage]);
    const distributionPath = path.join(stage, distribution);
    const binary = platform === 'win32' ? 'node.exe' : 'bin/node';
    await fs.copyFile(path.join(distributionPath, binary), path.join(bundle, 'runtime', path.basename(binary)));
    await fs.copyFile(path.join(distributionPath, 'LICENSE'), path.join(bundle, 'runtime/LICENSE'));
    for (const file of ['LICENSE', 'README.md', 'CHANGELOG']) {
        await fs.copyFile(path.join(root, file), path.join(bundle, file));
    }
    if (platform === 'win32') {
        await fs.writeFile(path.join(bundle, 'fm-dx-console.cmd'),
            '@echo off\r\n"%~dp0runtime\\node.exe" "%~dp0app\\src\\cli.js" %*\r\n');
    } else {
        await fs.chmod(path.join(bundle, 'runtime/node'), 0o755);
        await fs.writeFile(path.join(bundle, 'fm-dx-console'),
            '#!/bin/sh\nAPP_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexec "$APP_DIR/runtime/node" "$APP_DIR/app/src/cli.js" "$@"\n', { mode: 0o755 });
    }
    await fs.writeFile(path.join(bundle, 'INSTALL.txt'),
        `FM DX Console ${metadata.version} (CLI)\n\n` +
        'Extract the entire directory, then run fm-dx-console (fm-dx-console.cmd on Windows) in a terminal.\n' +
        'Node.js is included; no npm install is required. Keep app/ and runtime/ beside the launcher.\n' +
        'For audio, install FFmpeg with ffplay and ffmpeg available on PATH.\n' +
        'Start without arguments to select a recent server, or use --url http://server:port/.\n' +
        'Settings: ~/.fm-dx-console.json\n');
    await fs.mkdir(output, { recursive: true });
    if (platform === 'win32') {
        // Literal paths and a fixed script avoid cmd/PowerShell argument expansion.
        run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
            'Compress-Archive -LiteralPath $env:FM_DX_BUNDLE -DestinationPath $env:FM_DX_ARCHIVE -Force'],
        { env: { ...process.env, FM_DX_BUNDLE: bundle, FM_DX_ARCHIVE: path.join(output, `${name}.zip`) } });
    } else run('tar', ['-czf', path.join(output, `${name}.tar.gz`), '-C', stage, name]);
    console.log(`Packaged CLI: ${name}`);
} finally {
    await fs.rm(stage, { recursive: true, force: true });
}
