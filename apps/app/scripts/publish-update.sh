#!/bin/bash
# Publish a completed Sparkle beta. Keep latest.json and all legacy releases untouched.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/.."
VERSION=$(node -p "require('./package.json').version")
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'Invalid app version' >&2; exit 1; }
ROOT="$PWD/src-tauri/target/sparkle-beta"
DIR="$ROOT/releases/$VERSION"
APP="$ROOT/builds/$VERSION/Clutter.app"
ZIP="Clutter_beta_${VERSION}_aarch64.zip"
DMG="Clutter_beta_${VERSION}_aarch64.dmg"
BASE="https://clutter-updates.vigram-sivakumar.workers.dev"
WRANGLER="$HERE/../../../workers/updates/node_modules/.bin/wrangler"
CONFIG="$HERE/../../../workers/updates/wrangler.toml"
[ -x "$WRANGLER" ] && [ -f "$CONFIG" ] || { echo 'Missing update Worker dependencies or configuration' >&2; exit 1; }
for FILE in "$ZIP" "$DMG" appcast.xml SHA256SUMS; do
  [ -f "$DIR/$FILE" ] || { echo "Missing $DIR/$FILE; run npm run build:beta first" >&2; exit 1; }
done
(cd "$DIR" && shasum -a 256 -c SHA256SUMS)
"$HERE/verify-bundle.sh" "$APP" --sparkle-beta
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
HTTP=$(curl --silent --show-error --max-time 30 --output "$TMP/previous.xml" --write-out '%{http_code}' "$BASE/appcast.xml")
case "$HTTP" in
  200|404) ;;
  *) echo "Could not check the existing remote appcast (HTTP $HTTP)" >&2; exit 1 ;;
esac
python3 - "$DIR/appcast.xml" "$DIR/$ZIP" "$APP/Contents/Info.plist" "$HOME/.tauri/clutter-sparkle-beta.pub" "$VERSION" "$BASE/releases/$ZIP" "$HTTP" "$TMP/previous.xml" <<'PY'
import os, plistlib, re, sys, xml.etree.ElementTree as ET
manifest, archive, plist, pin, version, url, status, previous = sys.argv[1:]
ns = {'s':'http://www.andymatuschak.org/xml-namespaces/sparkle',
      'c':'https://clutter-updates.vigram-sivakumar.workers.dev/ns'}
with open(pin) as f: key = f.read().strip()
with open(plist, 'rb') as f: info = plistlib.load(f)
channel = ET.parse(manifest).getroot().find('channel')
item = channel.find('item')
enclosure = item.find('enclosure')
build = int(item.findtext('s:version', namespaces=ns))
assert item.findtext('s:shortVersionString', namespaces=ns) == version == info['CFBundleShortVersionString']
assert str(build) == info['CFBundleVersion']
assert channel.findtext('c:signingPublicKey', namespaces=ns) == key == info['SUPublicEDKey']
assert enclosure.get('url') == url
assert int(enclosure.get('length')) == os.path.getsize(archive)
assert re.fullmatch(r'[A-Za-z0-9+/]{86}==', enclosure.get('{'+ns['s']+'}edSignature',''))
if status == '200':
    old = ET.parse(previous).getroot().find('channel')
    assert old.findtext('c:signingPublicKey', namespaces=ns) == key, 'Beta signing key changed; restore the original'
    builds = [int(i.findtext('s:version', namespaces=ns)) for i in old.findall('item')]
    assert builds and build > max(builds), 'Release version must be newer than the published beta'
print('Verified beta appcast, artefacts, signing-key continuity and version ordering.')
PY

put() {
  "$WRANGLER" --config "$CONFIG" r2 object put "clutter-releases/$1" --file "$2" --content-type "$3" --cache-control "no-store, max-age=0" --remote
}
echo "Uploading Sparkle archive..."
put "releases/$ZIP" "$DIR/$ZIP" application/zip
echo "Uploading DMG..."
put "releases/$DMG" "$DIR/$DMG" application/x-apple-diskimage
# Check public downloads before advancing the feed. Old Worker code would reject the ZIP.
for FILE in "$ZIP" "$DMG"; do
  curl --fail --silent --show-error --max-time 120 "$BASE/releases/$FILE" -o "$TMP/$FILE"
  cmp -s "$DIR/$FILE" "$TMP/$FILE" || { echo "Remote $FILE differs from the local artefact" >&2; exit 1; }
done
echo "Uploading appcast last..."
put appcast.xml "$DIR/appcast.xml" "application/rss+xml"
curl --fail --silent --show-error --max-time 30 "$BASE/appcast.xml" -o "$TMP/published.xml"
cmp -s "$DIR/appcast.xml" "$TMP/published.xml" || { echo 'Published feed verification failed; inspect the remote feed before retrying' >&2; exit 1; }
echo "Published Sparkle beta $VERSION."
echo "DMG: $BASE/releases/$DMG"
echo "Feed: $BASE/appcast.xml"
