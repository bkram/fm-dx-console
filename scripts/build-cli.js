import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { transform } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
const app = path.join(root, 'dist/cli/app');
await fs.rm(app, { recursive: true, force: true });
await fs.mkdir(app, { recursive: true });
for (const name of ['package.json', 'package-lock.json', 'LICENSE', 'README.md', 'CHANGELOG']) {
    await fs.copyFile(path.join(root, name), path.join(app, name));
}

// Install only locked runtime dependencies. Electron, tsx and build tools are
// development dependencies and are never shipped in the CLI archive.
if (!process.env.npm_execpath) throw new Error('Run this script with npm run build:cli');
const install = spawnSync(process.execPath, [process.env.npm_execpath, 'ci',
    '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: app, stdio: 'inherit' });
if (install.error) throw install.error;
if (install.status !== 0) throw new Error('CLI runtime dependency installation failed');

async function compile(directory, output) {
    await fs.mkdir(output, { recursive: true });
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        if (entry.name === 'desktop') continue;
        const input = path.join(directory, entry.name);
        const target = path.join(output, entry.name.replace(/\.jsx$/, '.js'));
        if (entry.isDirectory()) await compile(input, target);
        else if (/\.(?:js|jsx)$/.test(entry.name)) {
            // Preserve module and worker locations; only JSX needs compilation.
            const source = (await fs.readFile(input, 'utf8'))
                .replace(/(\bfrom\s+['"][^'"]+)\.jsx(['"])/g, '$1.js$2')
                .replace('#!/usr/bin/env tsx', '#!/usr/bin/env node');
            const result = await transform(source, { loader: entry.name.endsWith('.jsx') ? 'jsx' : 'js',
                target: 'node22', sourcefile: path.relative(root, input) });
            await fs.writeFile(target, result.code);
        } else await fs.copyFile(input, target);
    }
}
await compile(path.join(root, 'src'), path.join(app, 'src'));
const metadata = JSON.parse(await fs.readFile(path.join(app, 'package.json'), 'utf8'));
metadata.main = 'src/cli.js';
metadata.bin = { 'fm-dx-console': 'src/cli.js' };
delete metadata.devDependencies;
delete metadata.scripts;
await fs.writeFile(path.join(app, 'package.json'), JSON.stringify(metadata, null, 2) + '\n');
await fs.chmod(path.join(app, 'src/cli.js'), 0o755);
console.log(`Compiled CLI: ${app}`);
