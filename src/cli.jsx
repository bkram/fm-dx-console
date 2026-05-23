#!/usr/bin/env tsx
import process from 'node:process';
import minimist from 'minimist';
import { render } from 'ink';
import React from 'react';
import App from './App.jsx';
import { isValidURL, normalizeUrl } from './lib/connection.js';

const VERSION = '1.60';
const USER_AGENT = `fm-dx-console/${VERSION}`;

const argv = minimist(process.argv.slice(2), {
    string: ['url'],
    boolean: ['debug', 'auto-play', 'help'],
});

if (argv.help) {
    console.log(`Usage: fm-dx-console [--url <fm-dx>] [--debug] [--auto-play]

  --url <addr>   Connect directly to an fm-dx-webserver URL.
                 Omit to pick from the public FM-DX server directory.
  --auto-play    Start audio immediately after connecting.
  --debug        Verbose logging to stderr.

Inside the TUI:
  'm'  switch server (browse public list)
  'b'  bandwidth selector
  'g'  AGC selector (Si47xx)
  'f'  toggle forced stereo
  'a'  advanced RDS panel
  'h'  show full keymap
`);
    process.exit(0);
}

let initialUrl = null;
if (argv.url) {
    const u = normalizeUrl(argv.url);
    if (!isValidURL(u)) {
        console.error('Invalid URL provided.');
        process.exit(1);
    }
    initialUrl = u;
}

const { waitUntilExit } = render(
    React.createElement(App, {
        initialUrl,
        userAgent: USER_AGENT,
        debug: !!argv.debug,
        autoPlay: !!argv['auto-play'],
    }),
);

waitUntilExit().catch((err) => {
    console.error(err);
    process.exit(1);
});
