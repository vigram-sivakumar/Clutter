#!/bin/bash
# The `tauri` command for this package (`npm run tauri ...`, `npm run desktop`). A development run (`tauri dev`) gets
# the development bundle identifier from src-tauri/tauri.dev.conf.json, so it keeps its own container, saved folder
# access and app data, apart from the packaged app's (com.vigram.clutter). Every other command, `tauri build`
# included, uses src-tauri/tauri.conf.json unchanged: a build is never given the development identifier here.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/.."
if [ "${1:-}" = "dev" ]; then
  shift
  exec ../../node_modules/.bin/tauri dev --config src-tauri/tauri.dev.conf.json "$@"
fi
exec ../../node_modules/.bin/tauri "$@"
