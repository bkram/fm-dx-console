# fm-dx-console

![Platform](https://img.shields.io/badge/platform-linux%20%7C%20windows%20%7C%20macos-brightgreen)
![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-blue)


A multi-platform console client for controlling the [fm-dx-webserver](https://github.com/NoobishSVK/fm-dx-webserver) and streaming audio directly from the command line. This client enables users to interact with the fm-dx-webserver remotely, providing convenience and flexibility.

Choose a recent server, browse the public directory, or provide a URL. The fm-dx-webserver must be v1.2.6 or higher for audio streaming.

The TUI is built with [Ink](https://github.com/vadimdemedes/ink) (React for the terminal). The previous blessed-based renderer was retired in 1.60.

## Download a packaged release

Download the CLI or GUI package for your operating system from
[GitHub Releases](https://github.com/bkram/fm-dx-console/releases/latest).
Source-code ZIP/TAR downloads are for development; use the named release assets below.

| Platform | CLI | GUI |
| --- | --- | --- |
| Windows x64 | `cli-…-windows-x64.zip` | `gui-…-win-x64.exe` installer |
| macOS Intel | `cli-…-macos-x64.tar.gz` | `gui-…-mac-x64.dmg` or `.zip` |
| macOS Apple Silicon | `cli-…-macos-arm64.tar.gz` | `gui-…-mac-arm64.dmg` or `.zip` |
| Linux x64 | `cli-…-linux-x64.tar.gz` | `gui-…-linux-x86_64.AppImage` or `gui-…-linux-amd64.deb` |

**CLI:** extract the entire archive, open a terminal in its directory and run
`./fm-dx-console` (Windows: `fm-dx-console.cmd`). Node.js and compiled application
code are included; npm and a separate Node installation are unnecessary. Keep the
`app` and `runtime` directories next to the launcher. CLI audio requires `ffplay`
and `ffmpeg` on PATH.

**GUI:** open the DMG and drag the application to Applications on macOS, run the
installer on Windows, or run the AppImage/install the DEB on Linux. For AppImage,
first run `chmod +x fm-dx-console-gui-*.AppImage`; systems without FUSE can use
`--appimage-extract-and-run`. The GUI includes its runtime and audio playback.

These macOS and Windows builds are unsigned. OS security prompts may require
allowing the application. `SHA256SUMS.txt` contains hashes for all release assets.

## Running from source

### Npm modules

Use Node.js 24 LTS (minimum 22.13) and install the locked dependencies with npm.

```bash
npm ci
```

### ffmpeg (CLI audio)

Both ffplay and ffmpeg need to be installed and accessible in your PATH.

## Starting

### Choose a server

Run without `--url` to choose from your last 25 connected servers, newest first.
Type to filter by server name or URL. Arrow keys and Page Up/Down navigate;
Enter connects and Esc cancels. The list works without fetching the public directory.

```bash
npm start
```

Select **Browse public servers** to fetch the directory from
[`servers.fmdx.org`](https://servers.fmdx.org/), or **Enter URL** to connect manually.
In the public directory, type to filter by name, city or country; Tab toggles
online-only filtering and Esc returns to recent servers.

A successful connection moves the server to the top of the history, keeping at
most 25 unique URLs. Settings are stored in `~/.fm-dx-console.json`; older saved
last-server settings are migrated automatically. `--no-resume` remains accepted
for compatibility; startup without a URL always opens the selector.

### Connect directly

```bash
npm start -- --url http://fm-dx-server:[port]/ [--auto-play]
```

or

```bash
npx tsx src/cli.jsx --url https://fm-dx-server/ [--auto-play]
```

Add `--auto-play` to begin audio playback immediately after connecting.

> **Note** — the `--` after `npm start` is required. Without it, npm
> consumes `--url=…` as one of its own flags and the script never sees it,
> so the app falls back to the picker. Use `npx tsx src/cli.jsx --url …`
> if you want to skip the separator.

While running, press **`m`** or **Esc** to swap to a different server without leaving the
TUI. The recent-server selector opens, with public-directory and manual-URL
options, and selecting a server switches the connection.

Run `npm start -- --help` to show all available options.

### FMDX App

The Electron interface uses the same receiver, settings and recent-server history as the CLI.
Starting without `--url` opens the selector; choose a recent server, browse the
public directory or enter a URL. **Esc** and **m** reopen the selector while connected.

Both interfaces provide tuning, bandwidth selection, AGC for Si47xx tuners,
forced stereo, iMS/EQ, antenna selection, volume, raw commands and server details.
The GUI displays decoded advanced RDS, RT-A/RT-B and RT+ alongside station data.
Signal units and the last 25 successful connections are shared through
`~/.fm-dx-console.json`. Control and RDS connections recover automatically.

The GUI decodes streamed MP3 audio in Chromium; CLI audio uses ffplay/ffmpeg.
The optional SpectrumGraphPlugin supplies the GUI spectrum. Clicking
or dragging on the spectrum tunes the receiver. Frequency entry accepts MHz,
comma decimals, shorthand (`985`) and kHz (`98500`) with the same validation as the CLI.

```bash
npm run electron -- --url http://fm-dx-server:[port]/
```

Run `npm run electron -- --help` to show command line options.

Electron uses its default sandbox. When required by your environment, pass
`--no-sandbox` explicitly.

The server URL can also be changed at runtime using the field above the
controls. Changing the address stops the old audio stream and switches the receiver.
Use Play to start audio on the new server, or launch with `--auto-play`.

## Help (console version)

The following keys can be used when running the command line interface. The
FMDX App understands these shortcuts as well:

Frequency Adjustment

    '←' decrease 0.1 MHz
    '↓' decrease 0.01 MHz
    'z' decrease 1 MHz
    '→' increase 0.1 MHz
    '↑' increase 0.01 MHz
    'x' increase 1 MHz

General Controls

    'r' refresh
    'p' play audio
    't' set frequency
    'C' send command
    'Esc' choose server / back
    'Ctrl+C' quit (CLI)
    'h' toggle help
    's' toggle server info
    'm' switch server (recent / public / manual)
    'b' bandwidth selector
    'g' AGC selector (Si47xx tuners)

Toggles

    '[' toggle iMS
    ']' toggle EQ
    'f' toggle forced stereo
    'y' cycle antenna

### Bandwidth selector

Press **`b`** to pick an IF bandwidth from the menu. The available steps match
the tuner reported by the server (TEF668x, XDR F1HD/S10HDiP, RTL-SDR/AirSpy or
Si47xx); the menu falls back to the TEF list if the tuner type is unknown.
Selecting **Auto** lets the firmware choose. The same `F<legacy>` + `W<value>`
command pair used by the web client is sent.

## Development

Use `nvm use` to select Node.js 24, then `npm ci`, `npm test` and `npm run lint`.
Tests cover configuration migration, the history limit, input validation,
WebSocket reconnects and audio resource races using local servers and fake processes.
The console and Electron desktop client are supported.

### Packaging and GitHub Releases

```bash
npm run package:cli
npm run smoke:cli
npm run package:gui
npm run smoke:gui
```

CLI archives are written to `dist/releases`; desktop installers to `dist/gui`.
Build on the target operating system and CPU architecture. The CLI runtime
version is pinned in `packaging/runtime.json`; packaging verifies the official
Node archive SHA-256 before extracting it. JSX is compiled before distribution,
and workers and production dependencies retain their module paths.

The [release workflow](.github/workflows/release.yml) builds both clients on
Windows, Linux, macOS Intel and macOS Apple Silicon. Branch pushes and manual
runs retain downloadable workflow artifacts without publishing a release.
Linux GUI smoke tests run under Xvfb; each desktop smoke test launches the
packaged application against a local HTTP/WebSocket tuner. It checks renderer
startup, history, tuning commands, controls, the packaged RDS worker, decoded
MP3 audio, server switching and cleanup, as well as fonts and version.
Use `npm run smoke:gui -- --source` to run the same checks before packaging.

To publish, update `package.json`, `package-lock.json` and `CHANGELOG`, commit
the changes, then push a matching `v<version>` tag. The workflow verifies the
version, runs tests/lint/audit, builds and tests every package, and verifies all
11 assets before publishing. It creates a draft, uploads packages and checksums,
then publishes the complete GitHub Release. Published releases are never
overwritten by reruns. GUI code signing and automatic updates are not configured.

## Shared architecture

`src/lib/receiver.js` is the application API for both frontends. It owns the
connection lifecycle, successful-server history, validated `action(type, value)`
commands and optional spectrum plugin. `connection.js` owns the HTTP/WebSocket
transports, command queue, reconnects and RDS worker. The Electron main process
adapts receiver events to validated IPC; the terminal subscribes directly.

Browser-safe modules provide URL/frequency validation, tuner profiles, server
filtering, shortcut intentions and station/RDS/display models. Keep new receiver
behavior there so both clients gain it together. Ink layout and DOM/SVG rendering
remain presentation adapters. Node worker audio and Chromium MediaSource audio
have separate output adapters because they use different playback runtimes.
Neither playback adapter implements tuner commands or connection history.

## Project layout

```text
src/
  cli.jsx          Console entry point
  App.jsx          Console UI
  components/      Console panels and selectors
  lib/             Shared receiver, actions, settings, shortcuts and display models
  shared/          Tuner metadata and RDS decoder used by both clients
  audio/           Node playback and reusable Chromium audio adapter
  workers/         Audio and RDS worker entry points
  desktop/         Electron main/preload, renderer, HTML and font assets
scripts/           Test runner and desktop launch helpers
test/              Automated regression tests
```

Use `npm start` for the console and `npm run electron` for the desktop client.
The optional `scripts/run-electron.sh` and `scripts/run-electron.bat` launchers
forward their arguments to the desktop client from any working directory.
