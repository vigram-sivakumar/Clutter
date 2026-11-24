#!/bin/bash
# Universal Sparkle builder: loopback integration or HTTPS direct distribution.
# Builds only; publishing is a separate step. Neither mode changes the App Store build.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/.."
[ "$(uname -s)" = Darwin ] || { echo "macOS required" >&2; exit 1; }
rustup target add aarch64-apple-darwin x86_64-apple-darwin
xcrun --find clang >/dev/null
SPARKLE_VERSION=2.10.1
MODE="${1:-integration}"
PORT=18766
CACHE="$PWD/src-tauri/target/sparkle-integration"
SDK="$CACHE/sdk-$SPARKLE_VERSION"
case "$MODE" in
  integration)
    ACCOUNT=com.vigram.clutter.sparkle.integration
    BASE_URL="http://localhost:$PORT"
    ROOT="$CACHE"
    ARCHIVE_PREFIX="$BASE_URL"
    ;;
  beta|direct)
    MODE=beta # Preserve internal key/account compatibility; public distribution is direct.
    ACCOUNT=com.vigram.clutter.sparkle.beta
    BASE_URL="https://clutter-updates.vigram-sivakumar.workers.dev"
    ROOT="$PWD/src-tauri/target/sparkle"
    ARCHIVE_PREFIX="$BASE_URL/releases"
    ;;
  *) echo "Usage: $0 [integration|beta]" >&2; exit 2 ;;
esac
SIGNING=adhoc
if [ "$MODE" = beta ]; then
  SIGNING="${CLUTTER_DIRECT_SIGNING:-adhoc}"
  case "$SIGNING" in
    adhoc) ;;
    developer-id)
      : "${APPLE_SIGNING_IDENTITY:?Set Developer ID Application identity}"
      : "${CLUTTER_NOTARY_PROFILE:?Set notarytool Keychain profile}"
      [[ "$APPLE_SIGNING_IDENTITY" = "Developer ID Application:"* ]] || { echo 'Developer ID Application identity required' >&2; exit 1; }
      security find-identity -v -p codesigning | grep -qF "$APPLE_SIGNING_IDENTITY" || { echo 'Developer ID identity not in Keychain' >&2; exit 1; }
      ;;
    *) echo 'CLUTTER_DIRECT_SIGNING must be adhoc or developer-id' >&2; exit 1 ;;
  esac
fi
mkdir -p "$CACHE" "$ROOT" "$ROOT/feed" "$ROOT/builds"
npm run check:version
"$HERE/check-atomic-default.sh"
VERSION=$(node -p "require('./package.json').version")
if [ "$MODE" = beta ] && [ -e "$ROOT/releases/$VERSION" ]; then
  echo "Release $VERSION already built; use publish:update or the direct release command to resume." >&2; exit 1
fi
# Separate monotonic Sparkle build number. Do not change the App Store's bundleVersion.
BUILD_NUMBER=$(python3 - "$VERSION" <<'PY'
import sys
major, minor, patch = map(int, sys.argv[1].split('.'))
if minor >= 1000 or patch >= 1000: raise SystemExit('Integration build number component too large')
print(major * 1000000 + minor * 1000 + patch + 1)
PY
)

if [ ! -f "$SDK/Sparkle.framework/Headers/Sparkle.h" ]; then
  STAGING=$(mktemp -d "$CACHE/sdk-download.XXXXXX")
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
# Beta uses a separate, persistent signing identity. Never silently rotate a key.
if [ "$MODE" = beta ]; then
  PIN="$HOME/.tauri/clutter-sparkle-beta.pub"
  mkdir -p "$(dirname "$PIN")"
  if [ -f "$PIN" ]; then
    PUBLIC_KEY=$("$KEY_TOOL" --account "$ACCOUNT" -p | tr -d '\r\n')
    [ "$PUBLIC_KEY" = "$(cat "$PIN")" ] || { echo 'Beta signing key does not match the pinned public key. Restore the original Keychain key.' >&2; exit 1; }
  else
    # Do not generate a replacement for an already published feed.
    HTTP=$(curl --silent --show-error --max-time 30 --output /dev/null --write-out '%{http_code}' "$BASE_URL/appcast.xml")
    [ "$HTTP" = 404 ] || { echo "Cannot initialise a beta key: remote appcast status $HTTP. Restore the existing key and public-key pin if already published." >&2; exit 1; }
    "$KEY_TOOL" --account "$ACCOUNT"
    PUBLIC_KEY=$("$KEY_TOOL" --account "$ACCOUNT" -p | tr -d '\r\n')
    [[ "$PUBLIC_KEY" =~ ^[A-Za-z0-9+/]{43}=$ ]] || { echo 'Invalid Sparkle beta public key' >&2; exit 1; }
    (umask 077; printf '%s\n' "$PUBLIC_KEY" > "$PIN")
  fi
else
  "$KEY_TOOL" --account "$ACCOUNT"
  PUBLIC_KEY=$("$KEY_TOOL" --account "$ACCOUNT" -p | tr -d '\r\n')
fi
[[ "$PUBLIC_KEY" =~ ^[A-Za-z0-9+/]{43}=$ ]] || { echo 'Invalid Sparkle public key' >&2; exit 1; }

# Use separate Cargo/bundle output so legacy release scripts cannot accidentally publish this app.
export CARGO_TARGET_DIR="$CACHE/cargo"
export CLUTTER_SPARKLE_FRAMEWORK="$FRAMEWORK"
# Tauri produces the intermediate bundle only. Sign/notarize the complete app below.
(
  unset APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID APPLE_API_KEY APPLE_API_ISSUER APPLE_API_KEY_PATH
  APPLE_SIGNING_IDENTITY=- VITE_CLUTTER_DIRECT_UPDATES=0 VITE_CLUTTER_SPARKLE_UPDATES=1 \
    ../../node_modules/.bin/tauri build --target universal-apple-darwin --bundles app --features sparkle-updates
)
APP="$CARGO_TARGET_DIR/universal-apple-darwin/release/bundle/macos/Clutter.app"
[ -d "$APP" ] || { echo "Missing Tauri application at $APP" >&2; exit 1; }
mkdir -p "$APP/Contents/Frameworks"
[ ! -e "$APP/Contents/Frameworks/Sparkle.framework" ] || { echo 'Unexpected pre-existing Sparkle framework' >&2; exit 1; }
ditto "$FRAMEWORK" "$APP/Contents/Frameworks/Sparkle.framework"
python3 - "$APP/Contents/Info.plist" "$BUILD_NUMBER" "$PUBLIC_KEY" "$BASE_URL/appcast.xml" "$MODE" <<'PY'
import plistlib, sys
path, build, public_key, feed, mode = sys.argv[1:]
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
# Only the loopback integration build may use local HTTP.
if mode == 'integration':
    info.setdefault('NSAppTransportSecurity', {})['NSAllowsLocalNetworking'] = True
else:
    assert feed.startswith('https://'), 'Beta feed must use HTTPS'
    ats = info.get('NSAppTransportSecurity', {})
    assert not ats.get('NSAllowsArbitraryLoads') and not ats.get('NSAllowsLocalNetworking'), 'Unexpected ATS exception'
with open(path, 'wb') as dest: plistlib.dump(info, dest)
PY
if [ "$SIGNING" = developer-id ]; then
  # Sparkle's documented inside-out signing order. Never use --deep to sign.
  SPK="$APP/Contents/Frameworks/Sparkle.framework"
  V="$SPK/Versions/B"
  sign() { codesign --force --sign "$APPLE_SIGNING_IDENTITY" --options runtime --timestamp "$@"; }
  sign "$V/XPCServices/Installer.xpc"
  if [ -d "$V/XPCServices/Downloader.xpc" ]; then
    sign --preserve-metadata=entitlements "$V/XPCServices/Downloader.xpc"
  fi
  sign "$V/Autoupdate"
  sign "$V/Updater.app"
  sign "$SPK"
  sign --entitlements src-tauri/Entitlements.sparkle.plist "$APP"
  codesign --verify --deep --strict "$APP"
  NOTARY=$(mktemp -d "$ROOT/notary.XXXXXX")
  ditto -c -k --sequesterRsrc --keepParent "$APP" "$NOTARY/Clutter.zip"
  xcrun notarytool submit "$NOTARY/Clutter.zip" --keychain-profile "$CLUTTER_NOTARY_PROFILE" --wait
  xcrun stapler staple "$APP"
  xcrun stapler validate "$APP"
  rm -rf "$NOTARY"
else
  # Previously validated ad-hoc path. Preserve nested framework signatures.
  codesign --force --sign - --timestamp=none --entitlements src-tauri/Entitlements.sparkle.plist "$APP"
fi
if [ "$MODE" = beta ]; then
  "$HERE/verify-bundle.sh" "$APP" --sparkle-direct
else
  "$HERE/verify-bundle.sh" "$APP" --sparkle-integration
fi

# Preserve each build for the two-version test; do not overwrite an installed app.
DEST="$ROOT/builds/$VERSION"
mkdir -p "$DEST"
if [ -e "$DEST/Clutter.app" ]; then rm -rf "$DEST/Clutter.app"; fi
ditto "$APP" "$DEST/Clutter.app"
NAME="Clutter_${VERSION}_universal.zip"
STAGING=$(mktemp -d "$ROOT/archive.XXXXXX")
ZIP="$STAGING/$NAME"
ditto -c -k --sequesterRsrc --keepParent "$DEST/Clutter.app" "$ZIP"
SIG=$("$SIGN_TOOL" --account "$ACCOUNT" -p "$ZIP" | tr -d '\r\n')
[[ "$SIG" =~ ^[A-Za-z0-9+/]{86}==$ ]] || { echo 'Invalid Sparkle archive signature' >&2; exit 1; }
LENGTH=$(stat -f%z "$ZIP")
python3 - "$STAGING/appcast.xml" "$VERSION" "$BUILD_NUMBER" "$ARCHIVE_PREFIX/$NAME" "$LENGTH" "$SIG" "$PUBLIC_KEY" "$MODE" "$SIGNING" <<'PY'
import sys, xml.etree.ElementTree as ET
path, version, build, url, length, signature, public_key, mode, signing = sys.argv[1:]
ns = 'http://www.andymatuschak.org/xml-namespaces/sparkle'
ET.register_namespace('sparkle', ns)
root = ET.Element('rss', version='2.0')
channel = ET.SubElement(root, 'channel')
ET.SubElement(channel, 'title').text = 'Clutter direct updates' if mode == 'beta' else 'Clutter local integration feed'
if mode == 'beta':
    # Publishing guard; Sparkle verifies archives against the key in the signed app.
    ET.register_namespace('clutter', 'https://clutter-updates.vigram-sivakumar.workers.dev/ns')
    ET.SubElement(channel, '{https://clutter-updates.vigram-sivakumar.workers.dev/ns}signingPublicKey').text = public_key
    ET.SubElement(channel, '{https://clutter-updates.vigram-sivakumar.workers.dev/ns}codeSigning').text = signing
item = ET.SubElement(channel, 'item')
ET.SubElement(item, 'title').text = 'Version ' + version
ET.SubElement(item, '{'+ns+'}version').text = build
ET.SubElement(item, '{'+ns+'}shortVersionString').text = version
ET.SubElement(item, '{'+ns+'}minimumSystemVersion').text = '13.3'
ET.SubElement(item, 'enclosure', {'url':url,'length':length,'type':'application/octet-stream','{'+ns+'}edSignature':signature})
ET.ElementTree(root).write(path, encoding='utf-8', xml_declaration=True)
PY
if [ "$MODE" = beta ]; then
  # Package the final Sparkle-signed app, not Tauri's intermediate bundle.
  python3 -I "$HERE/add-sparkle-delta.py" "$STAGING" "$DEST/Clutter.app" "$SDK" "$ACCOUNT" "$PUBLIC_KEY" "$BASE_URL" "$BUILD_NUMBER"
  DMG_NAME="Clutter_${VERSION}_universal.dmg"
  mkdir "$STAGING/dmg-root"
  ditto "$DEST/Clutter.app" "$STAGING/dmg-root/Clutter.app"
  ln -s /Applications "$STAGING/dmg-root/Applications"
  hdiutil create -volname Clutter -srcfolder "$STAGING/dmg-root" -format UDZO "$STAGING/$DMG_NAME"
  if [ "$SIGNING" = developer-id ]; then
    codesign --force --sign "$APPLE_SIGNING_IDENTITY" --timestamp "$STAGING/$DMG_NAME"
    xcrun notarytool submit "$STAGING/$DMG_NAME" --keychain-profile "$CLUTTER_NOTARY_PROFILE" --wait
    xcrun stapler staple "$STAGING/$DMG_NAME"
    xcrun stapler validate "$STAGING/$DMG_NAME"
  fi
  hdiutil verify "$STAGING/$DMG_NAME"
  rm -rf "$STAGING/dmg-root"
  # Publish only from this version's completed artefact directory.
  RELEASE="$ROOT/releases/$VERSION"
  (cd "$STAGING" && shasum -a 256 "$NAME" "$DMG_NAME" appcast.xml $(find . -maxdepth 1 -name '*.delta' -print) > SHA256SUMS)
  mkdir -p "$(dirname "$RELEASE")"
  [ ! -e "$RELEASE" ] || { echo "Release directory already exists: $RELEASE. Publish the existing verified artifacts or choose a new version." >&2; exit 1; }
  mv "$STAGING" "$RELEASE"
  echo "Sparkle direct build $VERSION (build $BUILD_NUMBER) is ready."
  echo "DMG: $RELEASE/$DMG_NAME"
  echo "Updater: $RELEASE/$NAME"
  echo "Appcast: $RELEASE/appcast.xml"
  echo 'Nothing was uploaded.'
  open "$RELEASE"
else
  # Artifact first, appcast last, so a running local server never offers a missing archive.
  mv "$ZIP" "$ROOT/feed/$NAME"
  mv "$STAGING/appcast.xml" "$ROOT/feed/appcast.xml"
  rmdir "$STAGING"
  echo "Sparkle integration build $VERSION (build $BUILD_NUMBER) is ready."
  echo "App: $DEST/Clutter.app"
  echo "Feed: $ROOT/feed/appcast.xml"
  echo 'Nothing was uploaded. Use only a disposable test Space for validation.'
  echo "Start local feed: python3 -m http.server $PORT --bind 127.0.0.1 --directory \"$ROOT/feed\""
  open "$DEST"
fi
