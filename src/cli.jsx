#!/usr/bin/env tsx
import process from 'node:process';
import fs from 'node:fs';
import { parseOptions } from './lib/cli-options.js';
import { render } from 'ink';
import React from 'react';
import App from './App.jsx';
import { loadConfig, configPath, flushConfig } from './lib/config.js';

const VERSION = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const USER_AGENT = `fm-dx-console/${VERSION}`;
let argv;
try { argv = parseOptions(process.argv.slice(2)); }
catch (error) { console.error(error.message); process.exit(1); }

if (argv.help) {
    console.log(`Usage: fm-dx-console [--url <fm-dx>] [--debug] [--auto-play] [--no-resume]

  --url <addr>   Connect directly to an fm-dx-webserver URL.
                 Omit to choose from the last 25 connected servers.
  --auto-play    Start audio immediately after connecting.
  --no-resume    Compatibility option: startup already opens the selector.
  --debug        Verbose logging to stderr.

Settings persisted at ${configPath}:
  - last 25 connected servers
  - signal unit (dBf / dBµV / dBm)

Inside the TUI:
  'm'  switch server (recent / public / manual)
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

const initialUrl = argv.initialUrl;

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
    process.exitCode = 1;
}).finally(() => flushConfig());
