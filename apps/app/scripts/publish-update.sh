#!/bin/bash
# Publish a complete direct release, without overwriting published versioned bytes.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/.."
VERSION=$(node -p "require('./package.json').version")
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'Invalid app version' >&2; exit 1; }
ROOT="$PWD/src-tauri/target/sparkle"
DIR="$ROOT/releases/$VERSION"
APP="$ROOT/builds/$VERSION/Clutter.app"
ZIP="Clutter_${VERSION}_universal.zip"
DMG="Clutter_${VERSION}_universal.dmg"
BASE="https://clutter-updates.vigram-sivakumar.workers.dev"
SDK="$PWD/src-tauri/target/sparkle-integration/sdk-2.10.1"
SIGN_TOOL=$(find "$SDK" -type f -name sign_update -print -quit)
WRANGLER="$HERE/../../../workers/updates/node_modules/.bin/wrangler"
CONFIG="$HERE/../../../workers/updates/wrangler.toml"
[ -x "$WRANGLER" ] && [ -f "$CONFIG" ] && [ -x "$SIGN_TOOL" ] || { echo 'Missing release tools' >&2; exit 1; }
for FILE in "$ZIP" "$DMG" appcast.xml SHA256SUMS; do
  [ -f "$DIR/$FILE" ] || { echo "Missing $DIR/$FILE; build direct artifacts first" >&2; exit 1; }
done
(cd "$DIR" && shasum -a 256 -c SHA256SUMS)
"$HERE/verify-bundle.sh" "$APP" --sparkle-direct
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
HTTP=$(curl --silent --show-error --max-time 30 --output "$TMP/previous.xml" --write-out '%{http_code}' "$BASE/appcast.xml")
case "$HTTP" in
  200|404) ;;
  *) echo "Could not check the existing remote appcast (HTTP $HTTP)" >&2; exit 1 ;;
esac
python3 -I - "$DIR" "$APP/Contents/Info.plist" "$HOME/.tauri/clutter-sparkle-beta.pub" "$VERSION" "$BASE" "$HTTP" "$TMP/previous.xml" "$SIGN_TOOL" > "$TMP/files" <<'PY'
import pathlib, plistlib, re, subprocess, sys, xml.etree.ElementTree as ET
directory, plist, pin, version, base, status, previous, signer = sys.argv[1:]
directory = pathlib.Path(directory)
ns = 'http://www.andymatuschak.org/xml-namespaces/sparkle'
c = 'https://clutter-updates.vigram-sivakumar.workers.dev/ns'
def tag(name): return f'{{{ns}}}{name}'
key = pathlib.Path(pin).read_text().strip()
with open(plist, 'rb') as f: info = plistlib.load(f)
manifest = directory / 'appcast.xml'
channel = ET.parse(manifest).getroot().find('channel')
items = channel.findall('item')
assert len(items) == 1
item = items[0]
build = int(item.findtext(tag('version')))
assert item.findtext(tag('shortVersionString')) == version == info['CFBundleShortVersionString']
assert str(build) == info['CFBundleVersion']
assert channel.findtext(f'{{{c}}}signingPublicKey') == key == info['SUPublicEDKey']
signing = channel.findtext(f'{{{c}}}codeSigning')
assert signing in ('adhoc', 'developer-id')
app = str(pathlib.Path(plist).parent.parent)
signature = subprocess.run(['codesign','-dvv',app], capture_output=True, text=True, check=True).stderr
assert ('Signature=adhoc' in signature) == (signing == 'adhoc')
if signing == 'developer-id':
    assert 'Authority=Developer ID Application' in signature
    dmg = directory / f'Clutter_{version}_universal.dmg'
    subprocess.run(['xcrun','stapler','validate',str(dmg)], check=True, stdout=sys.stderr)
    subprocess.run(['codesign','--verify',str(dmg)], check=True, stdout=sys.stderr)
if status == '200':
    old = ET.parse(previous).getroot().find('channel')
    assert old.findtext(f'{{{c}}}signingPublicKey') == key, 'Signing key changed'
    assert old.findtext(f'{{{c}}}codeSigning', 'adhoc') != 'developer-id' or signing == 'developer-id', 'Refusing signing downgrade'
    newest = max(int(i.findtext(tag('version'))) for i in old.findall('item'))
    assert build > newest or (build == newest and manifest.read_bytes() == pathlib.Path(previous).read_bytes()), 'Version must advance; only identical retry allowed'
full = item.find('enclosure')
deltas = item.findall(f'{tag("deltas")}/enclosure')
assert len(deltas) <= 1
names = []
for e in [full, *deltas]:
    if e is full:
        name = f'Clutter_{version}_universal.zip'
    else:
        source = int(e.get(tag('deltaFrom')))
        assert 0 < source < build
        name = f'Clutter_{source}_to_{build}_universal.delta'
        assert int(e.get('length')) < int(full.get('length'))
    assert e.get('url') == base + '/releases/' + name
    artifact = directory / name
    assert artifact.stat().st_size == int(e.get('length'))
    sig = subprocess.check_output([signer, '--account', 'com.vigram.clutter.sparkle.beta', '-p', str(artifact)], text=True).strip()
    assert re.fullmatch(r'[A-Za-z0-9+/]{86}==', sig) and sig == e.get(tag('edSignature')), 'Archive signature mismatch'
    names.append(name)
names.append(f'Clutter_{version}_universal.dmg')
for name in names: print(name)
PY
put() {
  "$WRANGLER" --config "$CONFIG" r2 object put "clutter-releases/$1" --file "$2" --content-type "$3" --cache-control "no-store, max-age=0" --remote
}
while IFS= read -r FILE; do
  case "$FILE" in
    *.zip) TYPE=application/zip ;;
    *.dmg) TYPE=application/x-apple-diskimage ;;
    *.delta) TYPE=application/octet-stream ;;
    *) echo "Unexpected release file $FILE" >&2; exit 1 ;;
  esac
  STATUS=$(curl --silent --show-error --max-time 180 --output "$TMP/download" --write-out '%{http_code}' "$BASE/releases/$FILE")
  case "$STATUS" in
    200) cmp -s "$DIR/$FILE" "$TMP/download" || { echo "Published $FILE is different; refusing overwrite" >&2; exit 1; } ;;
    404) put "releases/$FILE" "$DIR/$FILE" "$TYPE" ;;
    *) echo "Cannot check remote $FILE (HTTP $STATUS)" >&2; exit 1 ;;
  esac
  curl --fail --silent --show-error --max-time 180 "$BASE/releases/$FILE" -o "$TMP/download"
  cmp -s "$DIR/$FILE" "$TMP/download" || { echo "Remote $FILE differs" >&2; exit 1; }
done < "$TMP/files"
# Detect another publish during the uploads. Run publishing from one release machine.
HTTP_NOW=$(curl --silent --show-error --max-time 30 --output "$TMP/current.xml" --write-out '%{http_code}' "$BASE/appcast.xml")
[ "$HTTP_NOW" = "$HTTP" ] && { [ "$HTTP" = 404 ] || cmp -s "$TMP/previous.xml" "$TMP/current.xml"; } || { echo 'Remote appcast changed during publication; inspect before retrying' >&2; exit 1; }
echo "Uploading appcast last..."
put appcast.xml "$DIR/appcast.xml" "application/rss+xml"
curl --fail --silent --show-error --max-time 30 "$BASE/appcast.xml" -o "$TMP/published.xml"
cmp -s "$DIR/appcast.xml" "$TMP/published.xml" || { echo 'Published feed verification failed; inspect before retrying' >&2; exit 1; }
echo "Published universal direct release $VERSION."
echo "DMG: $BASE/releases/$DMG"
echo "Feed: $BASE/appcast.xml"
