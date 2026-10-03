import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const files = fs.readdirSync(new URL('../test/', import.meta.url))
    .filter((name) => /\.test\.(?:cjs|js)$/.test(name)).sort().map((name) => `test/${name}`);
// Explicit filenames work on Node 22/24 and Windows without shell glob expansion.
const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...files], { cwd: root, stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
