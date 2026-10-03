import fs from 'node:fs';

const { version } = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const changelog = fs.readFileSync(new URL('../CHANGELOG', import.meta.url), 'utf8');
const entry = changelog.split(`## FM-DX Console ${version}\n`)[1]?.split('\n## ')[0].trim();
if (!entry) throw new Error(`Missing changelog entry for ${version}`);
const notes = `CLI archives include Node.js. Extract the entire folder and run the launcher in a terminal; no npm install is needed. CLI audio requires ffplay and ffmpeg on PATH.\n\n` +
    `GUI: use the macOS DMG/ZIP, Windows installer, or Linux AppImage/DEB. The GUI includes its runtime and audio playback. macOS and Windows builds are currently unsigned.\n\n` +
    `Use SHA256SUMS.txt to verify downloaded files. Choose the asset matching your operating system and CPU architecture.\n\n${entry}\n`;
fs.writeFileSync(process.argv[2] || 'dist/release-notes.md', notes);
