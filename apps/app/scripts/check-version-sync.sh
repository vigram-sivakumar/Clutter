#!/bin/bash
# Fails unless every place that carries the Clutter app version agrees with its source of truth: the "version" field of
# apps/app/package.json. tauri.conf.json reads it from there (its "version" is the path ../package.json, so the
# bundle's CFBundleShortVersionString follows it); Cargo.toml and Cargo.lock cannot read it, so they are compared here.
# The root package.json is the workspace's own version and is deliberately not compared.
# Run before any packaged build (the first step of `tauri build`, through beforeBuildCommand).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/.."

VERSION=$(python3 -c "import json; print(json.load(open('package.json'))['version'])")
echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$' \
  || { echo "FAIL: apps/app/package.json version '$VERSION' is not MAJOR.MINOR.PATCH" >&2; exit 1; }

grep -qE '^  "version": "\.\./package\.json",' src-tauri/tauri.conf.json \
  || { echo "FAIL: src-tauri/tauri.conf.json must take its version from apps/app/package.json (\"version\": \"../package.json\")" >&2; exit 1; }

CARGO_VERSION=$(sed -nE 's/^version = "([^"]+)"/\1/p' src-tauri/Cargo.toml | head -1)
[ "$CARGO_VERSION" = "$VERSION" ] \
  || { echo "FAIL: src-tauri/Cargo.toml version '$CARGO_VERSION' disagrees with apps/app/package.json '$VERSION'" >&2; exit 1; }

LOCK_VERSION=$(awk '/^name = "app"$/ { getline; gsub(/version = |"/, ""); print; exit }' src-tauri/Cargo.lock)
[ "$LOCK_VERSION" = "$VERSION" ] \
  || { echo "FAIL: src-tauri/Cargo.lock lists app $LOCK_VERSION, not $VERSION (a cargo build refreshes it)" >&2; exit 1; }

echo "ok: app version $VERSION in package.json, tauri.conf.json (by path), Cargo.toml and Cargo.lock"
