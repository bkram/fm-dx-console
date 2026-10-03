import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

const directory = process.argv[2] || 'dist/releases';
const files = (await fs.readdir(directory)).filter((name) => /\.(?:tar\.gz|zip|dmg|exe|AppImage|deb)$/.test(name)).sort();
if (!files.length) throw new Error('No release packages found');
const lines = [];
for (const name of files) {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path.join(directory, name))) hash.update(chunk);
    lines.push(`${hash.digest('hex')}  ${name}`);
}
await fs.writeFile(path.join(directory, 'SHA256SUMS.txt'), lines.join('\n') + '\n');
console.log(`Checksums written for ${files.length} packages`);
