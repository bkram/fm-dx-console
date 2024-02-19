# fm-dx-console

A highly experimental console client for [fm-dx-webserver](https://github.com/NoobishSVK/fm-dx-webserver)

Only tested on Linux.

## Requirements

### Npm

Npm modules required:

- reblessed
- ws
- minimist

Install with npm

```bash
npm install
```

### Mpg123

mpg123 needs to be installed.

## Starting

### ws

```bash
node fm-dx-console.js --url ws://fm-dx-server:8080 
```

### wss

```bash
node fm-dx-console.js --url wss://fm-dx-server
```
