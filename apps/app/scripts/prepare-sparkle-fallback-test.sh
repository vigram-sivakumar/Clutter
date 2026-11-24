#!/bin/bash
# Local-only Sparkle fallback fixtures derived from existing ad-hoc releases.
# Never changes the release artifacts, package version, or public feed.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/.."
[ "$(uname -s)" = Darwin ] || { echo 'macOS required' >&2; exit 1; }
ROOT="$PWD/src-tauri/target/sparkle"
SDK="$PWD/src-tauri/target/sparkle-integration/sdk-2.10.1"
ACCOUNT=com.vigram.clutter.sparkle.fallback-test
BASE=http://localhost:18767
OLD="$ROOT/builds/0.0.9/Clutter.app"
NEW="$ROOT/builds/0.0.10/Clutter.app"
SKIP="$ROOT/builds/0.0.8/Clutter.app"
RELEASE="$ROOT/releases/0.0.10"
DELTA=Clutter_10_to_11_universal.delta
ZIP=Clutter_0.0.10_universal.zip
for APP in "$OLD" "$NEW"; do
  [ -d "$APP/Contents" ] || { echo "Missing prepared app: $APP" >&2; exit 1; }
done
(cd "$RELEASE" && shasum -a 256 -c SHA256SUMS)
[ -f "$RELEASE/$DELTA" ] || { echo 'Missing prepared delta' >&2; exit 1; }
KEY_TOOL=$(find "$SDK" -type f -name generate_keys -print -quit)
SIGN_TOOL=$(find "$SDK" -type f -name sign_update -print -quit)
BINARY_DELTA=$(find "$SDK" -type f -name BinaryDelta -print -quit)
for TOOL in "$KEY_TOOL" "$SIGN_TOOL" "$BINARY_DELTA"; do
  [ -x "$TOOL" ] || { echo 'Missing Sparkle SDK tool' >&2; exit 1; }
done
"$KEY_TOOL" --account "$ACCOUNT"
KEY=$("$KEY_TOOL" --account "$ACCOUNT" -p | tr -d '\r\n')
[[ "$KEY" =~ ^[A-Za-z0-9+/]{43}=$ ]] || { echo 'Invalid test public key' >&2; exit 1; }
[ "$KEY" != "$(cat "$HOME/.tauri/clutter-sparkle-beta.pub")" ] || { echo 'Refusing production signing key' >&2; exit 1; }

# Shared, uniquely named directory so a disposable macOS account can run the
# fixtures without needing access to the release machine's private Keychain.
umask 022
WORK=$(mktemp -d /Users/Shared/Clutter-fallback.XXXXXX)
trap 'echo "Fixture preparation failed; inspect $WORK" >&2' ERR
mkdir -p "$WORK/sources/no-match" "$WORK/sources/inapplicable" "$WORK/target" "$WORK/no-match" "$WORK/inapplicable"
copy_app() {
  local source="$1" dest="$2" version="$3" build="$4"
  codesign --verify --deep --strict "$source"
  codesign -d --verbose=4 "$source" 2>&1 | grep -q '^Signature=adhoc$'
  ditto "$source" "$dest"
  python3 -I - "$dest/Contents/Info.plist" "$KEY" "$BASE/appcast.xml" "$version" "$build" <<'PY'
import plistlib, sys
path, key, feed, version, build = sys.argv[1:]
with open(path, "rb") as f:
    info = plistlib.load(f)
if (info.get("CFBundleIdentifier") != "com.vigram.clutter"
    or info.get("CFBundleShortVersionString") != version
    or str(info.get("CFBundleVersion")) != build):
    raise SystemExit("Unexpected fixture bundle identity or version")
info["SUFeedURL"] = feed
info["SUPublicEDKey"] = key
info.setdefault("NSAppTransportSecurity", {})["NSAllowsLocalNetworking"] = True
with open(path, "wb") as f:
    plistlib.dump(info, f)
PY
  codesign --force --sign - --timestamp=none --entitlements "$HERE/../src-tauri/Entitlements.sparkle.plist" "$dest"
  codesign --verify --deep --strict "$dest"
}

# If the actual skipped version is available, exercise a true version skip.
# Otherwise test full selection from an appcast without a matching delta.
if [ -d "$SKIP/Contents" ]; then
  copy_app "$SKIP" "$WORK/sources/no-match/Clutter.app" 0.0.8 9
  SKIPPED=1
else
  copy_app "$OLD" "$WORK/sources/no-match/Clutter.app" 0.0.9 10
  SKIPPED=0
fi
copy_app "$OLD" "$WORK/sources/inapplicable/Clutter.app" 0.0.9 10
copy_app "$NEW" "$WORK/target/Clutter.app" 0.0.10 11
ditto -c -k --sequesterRsrc --keepParent "$WORK/target/Clutter.app" "$WORK/inapplicable/$ZIP"
cp "$RELEASE/$DELTA" "$WORK/inapplicable/$DELTA"
# The original patch is valid for the published source, not the local source
# whose signed Info.plist has a different key and feed. Verify this negative
# case before signing the patch with the separate test identity.
if "$BINARY_DELTA" apply "$WORK/sources/inapplicable/Clutter.app" "$WORK/should-not-apply.app" "$WORK/inapplicable/$DELTA"; then
  echo 'Expected delta application to fail against the modified source' >&2
  exit 1
fi
[ ! -e "$WORK/should-not-apply.app" ] || rm -rf "$WORK/should-not-apply.app"
FULL_SIG=$("$SIGN_TOOL" --account "$ACCOUNT" -p "$WORK/inapplicable/$ZIP" | tr -d '\r\n')
DELTA_SIG=$("$SIGN_TOOL" --account "$ACCOUNT" -p "$WORK/inapplicable/$DELTA" | tr -d '\r\n')
[[ "$FULL_SIG" =~ ^[A-Za-z0-9+/]{86}==$ && "$DELTA_SIG" =~ ^[A-Za-z0-9+/]{86}==$ ]] || { echo 'Invalid fixture signature' >&2; exit 1; }
ln "$WORK/inapplicable/$ZIP" "$WORK/no-match/$ZIP"
if [ "$SKIPPED" = 1 ]; then
  ln "$WORK/inapplicable/$DELTA" "$WORK/no-match/$DELTA"
fi
python3 -I - "$WORK" "$BASE" "$ZIP" "$DELTA" "$FULL_SIG" "$DELTA_SIG" "$SKIPPED" <<'PY'
from pathlib import Path
import sys
import xml.etree.ElementTree as ET
work, base, zip_name, delta_name, full_sig, delta_sig, skipped = sys.argv[1:]
work = Path(work)
ns = "http://www.andymatuschak.org/xml-namespaces/sparkle"
ET.register_namespace("sparkle", ns)
def tag(name):
    return f"{{{ns}}}{name}"
for scenario in ("no-match", "inapplicable"):
    root = ET.Element("rss", version="2.0")
    channel = ET.SubElement(root, "channel")
    ET.SubElement(channel, "title").text = "Clutter local fallback test"
    item = ET.SubElement(channel, "item")
    ET.SubElement(item, "title").text = "Version 0.0.10 (local test)"
    ET.SubElement(item, tag("version")).text = "11"
    ET.SubElement(item, tag("shortVersionString")).text = "0.0.10"
    ET.SubElement(item, tag("minimumSystemVersion")).text = "13.3"
    ET.SubElement(item, "enclosure", {
        "url": base + "/" + zip_name,
        "length": str((work / scenario / zip_name).stat().st_size),
        "type": "application/octet-stream",
        tag("edSignature"): full_sig,
    })
    if scenario == "inapplicable" or skipped == "1":
        deltas = ET.SubElement(item, tag("deltas"))
        ET.SubElement(deltas, "enclosure", {
            "url": base + "/" + delta_name,
            "length": str((work / scenario / delta_name).stat().st_size),
            "type": "application/octet-stream",
            tag("deltaFrom"): "10",
            tag("edSignature"): delta_sig,
        })
    ET.ElementTree(root).write(work / scenario / "appcast.xml", encoding="utf-8", xml_declaration=True)
PY
chmod 755 "$WORK"
# The fixture's target is local only; the archive is served from the two
# scenario directories, never from the release output or the shared root.
echo
echo "Local fallback fixtures: $WORK"
if [ "$SKIPPED" = 1 ]; then
  echo 'No-match scenario: 0.0.8 -> 0.0.10 (no matching delta).'
else
  echo 'No-match scenario: 0.0.9 -> 0.0.10 (full-only feed; 0.0.8 not present).'
fi
echo 'Inapplicable scenario: 0.0.9 -> 0.0.10 (signed delta, incompatible source).'
echo 'Use a separate disposable macOS user account; do not install these copies over a live app.'
echo 'Nothing was uploaded, and no production artifacts were modified.'
