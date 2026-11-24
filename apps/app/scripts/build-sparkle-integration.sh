#!/bin/bash
# Build actual Clutter with the experimental Sparkle bridge and a loopback-only appcast.
# Does not alter the existing Tauri release artifacts or upload anything.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/.."
[ "$(uname -s)" = Darwin ] && [ "$(uname -m)" = arm64 ] || { echo 'Apple Silicon macOS required' >&2; exit 1; }
xcrun --find clang >/dev/null
SPARKLE_VERSION=2.10.1
ACCOUNT=com.vigram.clutter.sparkle.integration
PORT=18766
BASE_URL="http://localhost:$PORT"
ROOT="$PWD/src-tauri/target/sparkle-integration"
SDK="$ROOT/sdk-$SPARKLE_VERSION"
mkdir -p "$ROOT" "$ROOT/feed" "$ROOT/builds"
npm run check:version
"$HERE/check-atomic-default.sh"
VERSION=$(node -p "require('./package.json').version")
# Separate monotonic Sparkle build number. Do not change the App Store's bundleVersion.
BUILD_NUMBER=$(python3 - "$VERSION" <<'PY'
import sys
major, minor, patch = map(int, sys.argv[1].split('.'))
if minor >= 1000 or patch >= 1000: raise SystemExit('Integration build number component too large')
print(major * 1000000 + minor * 1000 + patch + 1)
PY
)

if [ ! -f "$SDK/Sparkle.framework/Headers/Sparkle.h" ]; then
  STAGING=$(mktemp -d "$ROOT/sdk-download.XXXXXX")
  curl --fail --location --silent --show-error --proto '=https' --proto-redir '=https' \
    "https://github.com/sparkle-project/Sparkle/releases/download/$SPARKLE_VERSION/Sparkle-$SPARKLE_VERSION.tar.xz" \
    -o "$STAGING/Sparkle.tar.xz"
  mkdir "$STAGING/extracted"
  tar -xf "$STAGING/Sparkle.tar.xz" -C "$STAGING/extracted"
  [ -f "$STAGING/extracted/Sparkle.framework/Headers/Sparkle.h" ] || { echo 'Sparkle SDK headers missing' >&2; exit 1; }
  [ ! -e "$SDK" ] || { echo "Incomplete SDK already exists at $SDK; inspect it before retrying" >&2; exit 1; }
  mv "$STAGING/extracted" "$SDK"
  rm -rf "$STAGING"
fi
FRAMEWORK="$SDK/Sparkle.framework"
KEY_TOOL=$(find "$SDK" -type f -name generate_keys -print -quit)
SIGN_TOOL=$(find "$SDK" -type f -name sign_update -print -quit)
[ -x "$KEY_TOOL" ] && [ -x "$SIGN_TOOL" ] || { echo 'Sparkle signing tools missing' >&2; exit 1; }
codesign --verify --deep --strict "$FRAMEWORK"
"$KEY_TOOL" --account "$ACCOUNT"
PUBLIC_KEY=$("$KEY_TOOL" --account "$ACCOUNT" -p | tr -d '\r\n')
[[ "$PUBLIC_KEY" =~ ^[A-Za-z0-9+/]{43}=$ ]] || { echo 'Invalid Sparkle public key' >&2; exit 1; }

# Use separate Cargo/bundle output so legacy release scripts cannot accidentally publish this app.
export CARGO_TARGET_DIR="$ROOT/cargo"
export CLUTTER_SPARKLE_FRAMEWORK="$FRAMEWORK"
VITE_CLUTTER_DIRECT_UPDATES=0 VITE_CLUTTER_SPARKLE_UPDATES=1 \
  ../../node_modules/.bin/tauri build --bundles app --features sparkle-updates
APP="$CARGO_TARGET_DIR/release/bundle/macos/Clutter.app"
[ -d "$APP" ] || { echo "Missing Tauri application at $APP" >&2; exit 1; }
mkdir -p "$APP/Contents/Frameworks"
[ ! -e "$APP/Contents/Frameworks/Sparkle.framework" ] || { echo 'Unexpected pre-existing Sparkle framework' >&2; exit 1; }
ditto "$FRAMEWORK" "$APP/Contents/Frameworks/Sparkle.framework"
python3 - "$APP/Contents/Info.plist" "$BUILD_NUMBER" "$PUBLIC_KEY" "$BASE_URL/appcast.xml" <<'PY'
import plistlib, sys
path, build, public_key, feed = sys.argv[1:]
with open(path, 'rb') as source: info = plistlib.load(source)
info.update({
    'CFBundleVersion': build,
    'SUFeedURL': feed,
    'SUPublicEDKey': public_key,
    'SUEnableInstallerLauncherService': True,
    'SUEnableDownloaderService': False,
    'SUEnableAutomaticChecks': True,
    'SUAutomaticallyUpdate': True,
    'SUScheduledCheckInterval': 86400,
    'SUSendProfileInfo': False,
    'SUVerifyUpdateBeforeExtraction': True,
    'SUShowReleaseNotes': False,
})
# Local integration feed only. No arbitrary HTTP access in the eventual production build.
info.setdefault('NSAppTransportSecurity', {})['NSAllowsLocalNetworking'] = True
with open(path, 'wb') as dest: plistlib.dump(info, dest)
PY
# Match the already validated probe: preserve nested signatures, sign the outer bundle only.
codesign --force --sign - --timestamp=none --entitlements src-tauri/Entitlements.sparkle.plist "$APP"
"$HERE/verify-bundle.sh" "$APP" --sparkle-integration

# Preserve each build for the two-version test; do not overwrite an installed app.
DEST="$ROOT/builds/$VERSION"
mkdir -p "$DEST"
if [ -e "$DEST/Clutter.app" ]; then rm -rf "$DEST/Clutter.app"; fi
ditto "$APP" "$DEST/Clutter.app"
NAME="Clutter_${VERSION}_aarch64.zip"
STAGING=$(mktemp -d "$ROOT/archive.XXXXXX")
ZIP="$STAGING/$NAME"
ditto -c -k --sequesterRsrc --keepParent "$DEST/Clutter.app" "$ZIP"
SIG=$("$SIGN_TOOL" --account "$ACCOUNT" -p "$ZIP" | tr -d '\r\n')
[[ "$SIG" =~ ^[A-Za-z0-9+/]{86}==$ ]] || { echo 'Invalid Sparkle archive signature' >&2; exit 1; }
LENGTH=$(stat -f%z "$ZIP")
python3 - "$STAGING/appcast.xml" "$VERSION" "$BUILD_NUMBER" "$BASE_URL/$NAME" "$LENGTH" "$SIG" <<'PY'
import sys, xml.etree.ElementTree as ET
path, version, build, url, length, signature = sys.argv[1:]
ns = 'http://www.andymatuschak.org/xml-namespaces/sparkle'
ET.register_namespace('sparkle', ns)
root = ET.Element('rss', version='2.0')
channel = ET.SubElement(root, 'channel')
ET.SubElement(channel, 'title').text = 'Clutter local integration feed'
item = ET.SubElement(channel, 'item')
ET.SubElement(item, 'title').text = 'Version ' + version
ET.SubElement(item, '{'+ns+'}version').text = build
ET.SubElement(item, '{'+ns+'}shortVersionString').text = version
ET.SubElement(item, '{'+ns+'}minimumSystemVersion').text = '13.3'
ET.SubElement(item, 'enclosure', {'url':url,'length':length,'type':'application/octet-stream','{'+ns+'}edSignature':signature})
ET.ElementTree(root).write(path, encoding='utf-8', xml_declaration=True)
PY
# Artifact first, appcast last, so a running local server never offers a missing archive.
mv "$ZIP" "$ROOT/feed/$NAME"
mv "$STAGING/appcast.xml" "$ROOT/feed/appcast.xml"
rmdir "$STAGING"
echo
echo "Sparkle integration build $VERSION (build $BUILD_NUMBER) is ready."
echo "App: $DEST/Clutter.app"
echo "Feed: $ROOT/feed/appcast.xml"
echo 'Nothing was uploaded. Use only a disposable test Space for validation.'
echo "Start local feed: python3 -m http.server $PORT --bind 127.0.0.1 --directory \"$ROOT/feed\""
open "$DEST"
