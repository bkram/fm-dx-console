#!/usr/bin/env tsx
import process from 'node:process';
import minimist from 'minimist';
import { render } from 'ink';
import React from 'react';
import App from './App.jsx';
import { isValidURL, normalizeUrl } from './lib/connection.js';
import { loadConfig, configPath } from './lib/config.js';

const VERSION = '1.60';
const USER_AGENT = `fm-dx-console/${VERSION}`;

const argv = minimist(process.argv.slice(2), {
    string: ['url'],
    boolean: ['debug', 'auto-play', 'help', 'no-resume'],
});

if (argv.help) {
    console.log(`Usage: fm-dx-console [--url <fm-dx>] [--debug] [--auto-play] [--no-resume]

  --url <addr>   Connect directly to an fm-dx-webserver URL.
                 Omit to resume the last server, or open the picker if none.
  --auto-play    Start audio immediately after connecting.
  --no-resume    Ignore the saved last server and always open the picker.
  --debug        Verbose logging to stderr.

Settings persisted at ${configPath}:
  - last server URL
  - signal unit (dBf / dBµV / dBm)

Inside the TUI:
  'm'  switch server (browse public list)
  'b'  bandwidth selector
  'g'  AGC selector (Si47xx)
  'f'  toggle forced stereo
  'a'  advanced RDS panel
  'u'  cycle signal unit
  'h'  show full keymap
`);
    process.exit(0);
}

const config = loadConfig();

let initialUrl = null;
if (argv.url) {
    const u = normalizeUrl(argv.url);
    if (!isValidURL(u)) {
        console.error('Invalid URL provided.');
        process.exit(1);
    }
    initialUrl = u;
} else if (!argv['no-resume'] && config.lastUrl && isValidURL(config.lastUrl)) {
    initialUrl = config.lastUrl;
}

const { waitUntilExit } = render(
    React.createElement(App, {
        initialUrl,
        userAgent: USER_AGENT,
        debug: !!argv.debug,
        autoPlay: !!argv['auto-play'],
        initialSignalUnit: config.signalUnit,
    }),
);

waitUntilExit().catch((err) => {
    console.error(err);
    process.exit(1);
});
