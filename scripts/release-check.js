import fs from 'node:fs';

const metadata = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const lock = JSON.parse(fs.readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
const tag = process.env.RELEASE_TAG || process.env.GITHUB_REF_NAME;
if (lock.version !== metadata.version || lock.packages[''].version !== metadata.version) {
    throw new Error('package.json and package-lock.json versions differ');
}
if (tag && tag !== `v${metadata.version}`) throw new Error(`Release tag must be v${metadata.version}, got ${tag}`);
const changelog = fs.readFileSync(new URL('../CHANGELOG', import.meta.url), 'utf8');
if (!changelog.includes(`## FM-DX Console ${metadata.version}\n`)) throw new Error('Missing changelog entry');
console.log(`Release version verified: ${metadata.version}`);
