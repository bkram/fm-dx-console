import fs from 'node:fs';

const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const packages = {
    'linux-x64': [
        `fm-dx-console-cli-${version}-linux-x64.tar.gz`,
        `fm-dx-console-gui-${version}-linux-x86_64.AppImage`,
        `fm-dx-console-gui-${version}-linux-amd64.deb`,
    ],
    'windows-x64': [
        `fm-dx-console-cli-${version}-windows-x64.zip`,
        `fm-dx-console-gui-${version}-win-x64.exe`,
    ],
    ...Object.fromEntries(['x64', 'arm64'].map((arch) => [`macos-${arch}`, [
        `fm-dx-console-cli-${version}-macos-${arch}.tar.gz`,
        `fm-dx-console-gui-${version}-mac-${arch}.dmg`,
        `fm-dx-console-gui-${version}-mac-${arch}.zip`,
    ]])),
};
const target = process.argv[2];
if (target && !packages[target]) throw new Error(`Unknown release target: ${target}`);
const expected = target ? packages[target] : [...Object.values(packages).flat(), 'SHA256SUMS.txt'];
const files = [...fs.readdirSync('dist/releases'), ...(target ? fs.readdirSync('dist/gui') : [])];
for (const file of expected) {
    if (!files.includes(file)) throw new Error(`Missing release asset: ${file}`);
}
console.log(target ? `${target} verified: ${expected.length} packages`
    : `Complete release verified: ${expected.length - 1} packages and checksums`);
