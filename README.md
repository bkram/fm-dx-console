# fm-dx-console

![Platform](https://img.shields.io/badge/platform-linux%20%7C%20windows%20%7C%20macos-brightgreen)
![Node.js](https://img.shields.io/badge/node-%3E%3D14.x-blue)


A multi-platform console client for controlling the [fm-dx-webserver](https://github.com/NoobishSVK/fm-dx-webserver) and streaming audio directly from the command line. This client enables users to interact with the fm-dx-webserver remotely, providing convenience and flexibility.

To utilize this client, you'll need to provide the URL of the fm-dx-webserver. It's important to note that the fm-dx-webserver version must be v1.2.6 or higher for seamless audio streaming functionality.

With this console client, you can conveniently tune the fm-dx-webserver and stream audio effortlessly, all within the familiar environment of the command line.

## Screenshot

![Screenshot Linux](images/screenshot-Linux.png "Screenshot Linux")

## Requirements

### Npm modules

Install with npm.

```bash
npm install
```

### ffmpeg

ffplay needs to be installed, and accessible in your path.

## Starting

### Webserver address must be used

```bash
node fm-dx-console.js --url http://fm-dx-server:[port]/
```

or

```bash
node fm-dx-console.js --url https://fm-dx-server/
```

### Electron Application

A graphical interface is also included using Electron. It exposes buttons for
tuning, toggling iMS/EQ, cycling antennas and playing audio. Launch it with:

```bash
npm run electron -- --url http://fm-dx-server:[port]/
```

## Help (console version)

The following keys can be used when running the command line interface:

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
    'Esc' quit
    'h' toggle help

Toggles

    '[' toggle iMS
    ']' toggle EQ
    'y' toggle antenna
