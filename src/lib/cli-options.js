import minimist from 'minimist';
import { normalizeUrl } from './urls.js';

export function parseOptions(args) {
    const argv = minimist(args, {
        string: ['url'],
        boolean: ['debug', 'auto-play', 'help', 'resume'],
        default: { resume: false },
    });
    // Recent servers are selected explicitly, including when --no-resume is used.
    return { ...argv, initialUrl: argv.url ? normalizeUrl(argv.url) : null };
}
