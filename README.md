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
| Linux x64 | `cli-…-linux-x64.tar.gz` | `gui-…-linux-x64.AppImage` or `.deb` |

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

While running, press **`m`** to swap to a different server without leaving the
TUI. The recent-server selector opens, with public-directory and manual-URL
options, and selecting a server switches the connection.

Run `npm start -- --help` to show all available options.

### FMDX App

The FMDX App is an Electron-based interface styled like a small audio player. It
uses a dark theme inspired by the look of **XDR-GTK** so it blends in with
modern GTK desktops. It displays the tuned frequency to three decimals. The
value can be edited and will
only update from the tuner when the input field is not focused. Material icons
are used for the tuning controls. Buttons let you tune in 1 MHz, 0.1 MHz and 0.01
MHz steps, toggle iMS/EQ, cycle antennas and control audio
playback. Tuner updates are received over a WebSocket so the fields refresh
automatically. Pressing **Enter** in the frequency field tunes to the value and
shows the rounded frequency again. The interface now places the Tuner and RDS
panels side by side, as well as the Station and Status panels, while the
spectrum display is slightly smaller. Keyboard shortcuts from the console client
are also supported. The window starts larger so all details fit comfortably and
the Station section always lists its field names (Name, Location, etc.) even if
data is missing. Server details show the tuner name followed by the description
on separate lines. RDS information lists the PS and PI codes along with
flags and the Programme Type shown as `number/name` (displaying `0/None` when
no PTY is available). If Decoder Information bits are present, the panel also
shows whether Dynamic PTY, Artificial Head or Compression are enabled and if
the broadcast is stereo. Characters in the PS and RadioText turn grey when
errors are reported. A drop-down next to the signal meter lets you display
strength in dBf, dBµV or dBm. The frequency field accepts only numeric input and the
shortcut **t** focuses it without inserting the letter. Launch it with:

The status section shows the current user count, ping time and whether audio is
playing on separate lines.
The **Spectrum Scan** button sweeps the band from 83 to 108 MHz in 0.05 MHz steps
and updates the spectrum display in real time. Frequencies not yet scanned start
at 0 dBf so the graph covers the full range while the sweep runs. Audio playback
is paused during the scan and resumes when finished. Once the sweep completes
the tuner returns to the original frequency. Clicking a point on the graph tunes
directly to that frequency.

```bash
npm run electron -- --url http://fm-dx-server:[port]/
```

Run `npm run electron -- --help` to show command line options.

Electron uses its default sandbox. When required by your environment, pass
`--no-sandbox` explicitly.

The server URL can also be changed at runtime using the field above the
controls. Changing the address automatically restarts the audio connection so it
uses the new backend.

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
    'Esc' quit
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
packaged window and checks its version, preload bridge and fonts.

To publish, update `package.json`, `package-lock.json` and `CHANGELOG`, commit
the changes, then push a matching `v<version>` tag. The workflow verifies the
version, runs tests/lint/audit, builds and tests every package, and verifies all
11 assets before publishing. It creates a draft, uploads packages and checksums,
then publishes the complete GitHub Release. Published releases are never
overwritten by reruns. GUI code signing and automatic updates are not configured.

## Project layout

```text
src/
  cli.jsx          Console entry point
  App.jsx          Console UI
  components/      Console panels and selectors
  lib/             Connection, configuration and input logic
  shared/          Tuner metadata and RDS decoder used by both clients
  audio/           Console audio playback
  workers/         Audio and RDS worker entry points
  desktop/         Electron main/preload, renderer, HTML and font assets
scripts/           Test runner and desktop launch helpers
test/              Automated regression tests
```

Use `npm start` for the console and `npm run electron` for the desktop client.
The optional `scripts/run-electron.sh` and `scripts/run-electron.bat` launchers
forward their arguments to the desktop client from any working directory.
