import fs from 'node:fs';

const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const expected = [
    ...['linux-x64.tar.gz', 'windows-x64.zip', 'macos-x64.tar.gz', 'macos-arm64.tar.gz']
        .map((suffix) => `fm-dx-console-cli-${version}-${suffix}`),
    ...['linux-x64.AppImage', 'linux-x64.deb', 'win-x64.exe',
        'mac-x64.dmg', 'mac-x64.zip', 'mac-arm64.dmg', 'mac-arm64.zip']
        .map((suffix) => `fm-dx-console-gui-${version}-${suffix}`),
    'SHA256SUMS.txt',
];
const files = fs.readdirSync('dist/releases');
for (const file of expected) {
    if (!files.includes(file)) throw new Error(`Missing release asset: ${file}`);
}
console.log(`Complete release verified: ${expected.length - 1} packages and checksums`);
