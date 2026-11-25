#!/bin/bash
# Extract release tools only from the exact upstream SDK archive.
set -euo pipefail
CACHE="${1:?SDK cache directory required}"
SDK="${2:?fresh extraction directory required}"
VERSION=2.10.1
# https://github.com/sparkle-project/Sparkle/releases/expanded_assets/2.10.1
SHA256=1a856d2a9edb8e628de88121d7be04cf0e2167f8641650b78fca00b14244cf27
NAME="Sparkle-$VERSION.tar.xz"
mkdir -p "$CACHE"
mkdir "$SDK"
ARCHIVE="$SDK/$NAME"
if [ -f "$CACHE/$NAME" ]; then
  cp "$CACHE/$NAME" "$ARCHIVE"
else
  curl -q --fail --location --silent --show-error --proto '=https' --proto-redir '=https' --max-time 120 \
    "https://github.com/sparkle-project/Sparkle/releases/download/$VERSION/$NAME" -o "$ARCHIVE"
fi
DIGEST=$(shasum -a 256 "$ARCHIVE")
[ "${DIGEST%% *}" = "$SHA256" ] || { echo 'Sparkle SDK SHA-256 mismatch; refusing extraction' >&2; exit 1; }
tar -xf "$ARCHIVE" -C "$SDK"
[ -f "$SDK/Sparkle.framework/Headers/Sparkle.h" ] || { echo 'Sparkle SDK headers missing' >&2; exit 1; }
[ -x "$SDK/bin/generate_keys" ] && [ -x "$SDK/bin/sign_update" ] && [ -x "$SDK/bin/BinaryDelta" ] \
  || { echo 'Sparkle SDK tools missing' >&2; exit 1; }
codesign --verify --deep --strict "$SDK/Sparkle.framework"
if [ ! -e "$CACHE/$NAME" ]; then
  mv "$ARCHIVE" "$CACHE/$NAME"
else
  rm -f "$ARCHIVE"
fi
