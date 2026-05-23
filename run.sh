#!/bin/bash

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Auto-add --no-sandbox on Linux
if [ "$(uname)" = "Linux" ]; then
    if [[ "$*" != *"--no-sandbox"* ]]; then
        set -- "$@" --no-sandbox
    fi
fi

# Use npm run electron which runs: electron --no-sandbox .
# But we need to append our extra flags
# Add GPU flags to help with rendering issues
node_modules/.bin/electron . "$@" --disable-gpu --enable-logging
