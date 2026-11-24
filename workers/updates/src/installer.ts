// Served as plain text by the existing read-only release Worker.
export const INSTALLER_SCRIPT = String.raw`#!/bin/bash
# Install the current Clutter direct release. Review before running.
# HTTPS is the trust boundary for this bootstrap and its release metadata.
# Ad-hoc signatures check integrity, not developer identity.
set -euo pipefail

main() (
    export PATH=/usr/bin:/bin:/usr/sbin:/sbin
    BASE="https://updates.clutterapp.workers.dev"
    PIN="ykd7n6b2j4O9A3NelN6uQyABnobGQsZvZc1pyZ5OBXc="
    NS="https://clutter-updates.vigram-sivakumar.workers.dev/ns"
    SPARKLE_NS="http://www.andymatuschak.org/xml-namespaces/sparkle"
    DEST="/Applications/Clutter.app"
    fail() { printf 'Clutter installer: %s\n' "$*" >&2; exit 1; }
    [ "$(uname -s)" = Darwin ] || fail "Clutter requires macOS."
    case "$(uname -m)" in arm64|x86_64) ;; *) fail "Unsupported architecture." ;; esac
    IFS=. read -r major minor rest <<< "$(sw_vers -productVersion)"
    [[ "$major" =~ ^[0-9]+$ && "$minor" =~ ^[0-9]+$ ]] || fail "Cannot determine macOS version."
    (( major > 13 || (major == 13 && minor >= 3) )) || fail "Clutter requires macOS 13.3 or later."
    for existing in "$DEST" "$HOME/Applications/Clutter.app"; do
        if [ -e "$existing" ] || [ -L "$existing" ]; then
            fail "Clutter already exists at $existing. Use Check for Updates, or move the existing app aside explicitly."
        fi
    done
    [ -w /Applications ] || fail "Applications is not writable. Use the DMG installation instead."
    for cmd in curl xmllint shasum ditto codesign spctl stat mktemp open; do
        command -v "$cmd" >/dev/null || fail "Missing system utility: $cmd. Use the DMG installation instead."
    done
    WORK=$(mktemp -d -t clutter-install)
    STAGE=""
    cleanup() {
        [ -z "$STAGE" ] || rm -rf -- "$STAGE"
        rm -rf -- "$WORK"
    }
    trap cleanup EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM
    download() {
        # No redirects, insecure transport or user curl configuration.
        curl -q --fail --silent --show-error --proto '=https' --tlsv1.2 --max-time 300 "$1" -o "$2"
    }

    # Use the terminal's own palette, never modify shell settings.
    # NO_COLOR (nonempty), TERM=dumb and redirected output use plain text.
    GREEN="" BOLD="" MUTED="" YELLOW="" RESET=""
    # printenv also handles unset variables under set -u.
    if [ -t 1 ] && [ -z "$(printenv NO_COLOR || true)" ] && [ -n "$(printenv TERM || true)" ] && [ "$(printenv TERM || true)" != dumb ]; then
        GREEN=
    if grep -Eq '<!DOCTYPE|<!ENTITY' "$WORK/feed.xml"; then fail "Unexpected XML declarations."; fi
    xml() { xmllint --nonet --xpath "$1" "$WORK/feed.xml"; }
    [ "$(xml 'count(/rss/channel/item)')" = 1 ] || fail "Unexpected release feed."
    [ "$(xml 'count(/rss/channel/item/enclosure)')" = 1 ] || fail "Unexpected release archive."
    VERSION=$(xml "string(/rss/channel/item/*[local-name()='shortVersionString' and namespace-uri()='$SPARKLE_NS'])")
    BUILD=$(xml "string(/rss/channel/item/*[local-name()='version' and namespace-uri()='$SPARKLE_NS'])")
    KEY=$(xml "string(/rss/channel/*[local-name()='signingPublicKey' and namespace-uri()='$NS'])")
    SIGNING=$(xml "string(/rss/channel/*[local-name()='codeSigning' and namespace-uri()='$NS'])")
    SHA=$(xml "string(/rss/channel/item/enclosure/@*[local-name()='sha256' and namespace-uri()='$NS'])")
    URL=$(xml 'string(/rss/channel/item/enclosure/@url)')
    SIZE=$(xml 'string(/rss/channel/item/enclosure/@length)')
    [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && "$BUILD" =~ ^[0-9]+$ && "$SIZE" =~ ^[1-9][0-9]*$ ]] || fail "Invalid release metadata."
    [ "$KEY" = "$PIN" ] || fail "Unexpected release signing identity."
    [ "$URL" = "$BASE/releases/Clutter_$VERSION"_universal.zip ] || fail "This release predates Terminal installation. Use the DMG or try the next release."
    [[ "$SHA" =~ ^[a-f0-9]{64}$ ]] || fail "This release lacks Terminal installer integrity metadata."
    case "$SIGNING" in
        adhoc|developer-id) ;;
        *) fail "Unknown signing mode." ;;
    esac
    download "$URL" "$WORK/Clutter.zip"
    [ "$(stat -f%z "$WORK/Clutter.zip")" = "$SIZE" ] || fail "Download size mismatch."
    actual=$(shasum -a 256 "$WORK/Clutter.zip")
    [ "$actual" = "$SHA  $WORK/Clutter.zip" ] || fail "Download checksum mismatch."
    step_done "Downloaded universal application"
    mkdir "$WORK/extracted"
    ditto -x -k "$WORK/Clutter.zip" "$WORK/extracted"
    APP="$WORK/extracted/Clutter.app"
    [ -d "$APP" ] && [ ! -L "$APP" ] || fail "Missing application."
    verify_app() {
        local app="$1"
        local info="$app/Contents/Info.plist"
        local signature
        codesign --verify --deep --strict --all-architectures "$app"
        [ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$info")" = com.vigram.clutter ] || fail "Wrong bundle identifier."
        [ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$info")" = "$VERSION" ] || fail "Wrong app version."
        [ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$info")" = "$BUILD" ] || fail "Wrong build number."
        [ "$(/usr/libexec/PlistBuddy -c 'Print :SUPublicEDKey' "$info")" = "$PIN" ] || fail "Wrong embedded updater key."
        [ "$(/usr/libexec/PlistBuddy -c 'Print :SUFeedURL' "$info")" = "$BASE/appcast.xml" ] || fail "Wrong update endpoint."
        signature=$(codesign -d --verbose=4 "$app" 2>&1)
        if [ "$SIGNING" = developer-id ]; then
            printf '%s\n' "$signature" | grep -q '^Authority=Developer ID Application:' || fail "Missing Developer ID signature."
            spctl --assess --type execute "$app" || fail "macOS rejected the release."
        else
            printf '%s\n' "$signature" | grep -q '^Signature=adhoc$' || fail "Unexpected beta signature."
        fi
    }
    verify_app "$APP"
    step_done "Verified application integrity"
    STAGE=$(mktemp -d /Applications/.clutter-install.XXXXXX)
    ditto "$APP" "$STAGE/Clutter.app"
    verify_app "$STAGE/Clutter.app"
    [ ! -e "$DEST" ] && [ ! -L "$DEST" ] || fail "An installation appeared during download; refusing to overwrite."
    # Move into the parent directory on the same filesystem, with no-clobber.
    mv -n "$STAGE/Clutter.app" /Applications/
    [ ! -e "$STAGE/Clutter.app" ] && [ -d "$DEST" ] || fail "Installation destination is occupied."
    step_done "Installed application"
    printf '\n%s%s✓ Clutter successfully installed!%s\n\n' "$GREEN" "$BOLD" "$RESET"
    printf '  %sVersion:%s  %s%s%s\n' "$MUTED" "$RESET" "$YELLOW" "$VERSION" "$RESET"
    printf '  %sLocation:%s %s\n\n' "$MUTED" "$RESET" "$DEST"
    printf '%sLaunching Clutter...%s\n' "$MUTED" "$RESET"
    if ! open "$DEST"; then
        printf 'Clutter is installed, but macOS could not launch it. Open it from Applications.\n' >&2
        if [ "$SIGNING" = adhoc ]; then
            printf 'This beta is not notarized by Apple; macOS may require approval.\n' >&2
        fi
        exit 1
    fi
)
main
`;
\033[32m'
        BOLD=
    if grep -Eq '<!DOCTYPE|<!ENTITY' "$WORK/feed.xml"; then fail "Unexpected XML declarations."; fi
    xml() { xmllint --nonet --xpath "$1" "$WORK/feed.xml"; }
    [ "$(xml 'count(/rss/channel/item)')" = 1 ] || fail "Unexpected release feed."
    [ "$(xml 'count(/rss/channel/item/enclosure)')" = 1 ] || fail "Unexpected release archive."
    VERSION=$(xml "string(/rss/channel/item/*[local-name()='shortVersionString' and namespace-uri()='$SPARKLE_NS'])")
    BUILD=$(xml "string(/rss/channel/item/*[local-name()='version' and namespace-uri()='$SPARKLE_NS'])")
    KEY=$(xml "string(/rss/channel/*[local-name()='signingPublicKey' and namespace-uri()='$NS'])")
    SIGNING=$(xml "string(/rss/channel/*[local-name()='codeSigning' and namespace-uri()='$NS'])")
    SHA=$(xml "string(/rss/channel/item/enclosure/@*[local-name()='sha256' and namespace-uri()='$NS'])")
    URL=$(xml 'string(/rss/channel/item/enclosure/@url)')
    SIZE=$(xml 'string(/rss/channel/item/enclosure/@length)')
    [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && "$BUILD" =~ ^[0-9]+$ && "$SIZE" =~ ^[1-9][0-9]*$ ]] || fail "Invalid release metadata."
    [ "$KEY" = "$PIN" ] || fail "Unexpected release signing identity."
    [ "$URL" = "$BASE/releases/Clutter_$VERSION"_universal.zip ] || fail "This release predates Terminal installation. Use the DMG or try the next release."
    [[ "$SHA" =~ ^[a-f0-9]{64}$ ]] || fail "This release lacks Terminal installer integrity metadata."
    case "$SIGNING" in
        adhoc|developer-id) ;;
        *) fail "Unknown signing mode." ;;
    esac
    printf 'Installing Clutter %s\n\n' "$VERSION"
    printf 'Downloading Clutter...\n'
    download "$URL" "$WORK/Clutter.zip"
    [ "$(stat -f%z "$WORK/Clutter.zip")" = "$SIZE" ] || fail "Download size mismatch."
    actual=$(shasum -a 256 "$WORK/Clutter.zip")
    [ "$actual" = "$SHA  $WORK/Clutter.zip" ] || fail "Download checksum mismatch."
    printf 'Verifying application...\n'
    mkdir "$WORK/extracted"
    ditto -x -k "$WORK/Clutter.zip" "$WORK/extracted"
    APP="$WORK/extracted/Clutter.app"
    [ -d "$APP" ] && [ ! -L "$APP" ] || fail "Missing application."
    verify_app() {
        local app="$1"
        local info="$app/Contents/Info.plist"
        local signature
        codesign --verify --deep --strict --all-architectures "$app"
        [ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$info")" = com.vigram.clutter ] || fail "Wrong bundle identifier."
        [ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$info")" = "$VERSION" ] || fail "Wrong app version."
        [ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$info")" = "$BUILD" ] || fail "Wrong build number."
        [ "$(/usr/libexec/PlistBuddy -c 'Print :SUPublicEDKey' "$info")" = "$PIN" ] || fail "Wrong embedded updater key."
        [ "$(/usr/libexec/PlistBuddy -c 'Print :SUFeedURL' "$info")" = "$BASE/appcast.xml" ] || fail "Wrong update endpoint."
        signature=$(codesign -d --verbose=4 "$app" 2>&1)
        if [ "$SIGNING" = developer-id ]; then
            printf '%s\n' "$signature" | grep -q '^Authority=Developer ID Application:' || fail "Missing Developer ID signature."
            spctl --assess --type execute "$app" || fail "macOS rejected the release."
        else
            printf '%s\n' "$signature" | grep -q '^Signature=adhoc$' || fail "Unexpected beta signature."
        fi
    }
    verify_app "$APP"
    printf 'Installing Clutter...\n'
    STAGE=$(mktemp -d /Applications/.clutter-install.XXXXXX)
    ditto "$APP" "$STAGE/Clutter.app"
    verify_app "$STAGE/Clutter.app"
    [ ! -e "$DEST" ] && [ ! -L "$DEST" ] || fail "An installation appeared during download; refusing to overwrite."
    # Move into the parent directory on the same filesystem, with no-clobber.
    mv -n "$STAGE/Clutter.app" /Applications/
    [ ! -e "$STAGE/Clutter.app" ] && [ -d "$DEST" ] || fail "Installation destination is occupied."
    printf '\n✓ Clutter installed successfully\n'
    printf 'Launching Clutter...\n'
    if ! open "$DEST"; then
        printf 'Clutter is installed, but macOS could not launch it. Open it from Applications.\n' >&2
        if [ "$SIGNING" = adhoc ]; then
            printf 'This beta is not notarized by Apple; macOS may require approval.\n' >&2
        fi
        exit 1
    fi
)
main
`;
\033[1m'
        MUTED=
    if grep -Eq '<!DOCTYPE|<!ENTITY' "$WORK/feed.xml"; then fail "Unexpected XML declarations."; fi
    xml() { xmllint --nonet --xpath "$1" "$WORK/feed.xml"; }
    [ "$(xml 'count(/rss/channel/item)')" = 1 ] || fail "Unexpected release feed."
    [ "$(xml 'count(/rss/channel/item/enclosure)')" = 1 ] || fail "Unexpected release archive."
    VERSION=$(xml "string(/rss/channel/item/*[local-name()='shortVersionString' and namespace-uri()='$SPARKLE_NS'])")
    BUILD=$(xml "string(/rss/channel/item/*[local-name()='version' and namespace-uri()='$SPARKLE_NS'])")
    KEY=$(xml "string(/rss/channel/*[local-name()='signingPublicKey' and namespace-uri()='$NS'])")
    SIGNING=$(xml "string(/rss/channel/*[local-name()='codeSigning' and namespace-uri()='$NS'])")
    SHA=$(xml "string(/rss/channel/item/enclosure/@*[local-name()='sha256' and namespace-uri()='$NS'])")
    URL=$(xml 'string(/rss/channel/item/enclosure/@url)')
    SIZE=$(xml 'string(/rss/channel/item/enclosure/@length)')
    [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && "$BUILD" =~ ^[0-9]+$ && "$SIZE" =~ ^[1-9][0-9]*$ ]] || fail "Invalid release metadata."
    [ "$KEY" = "$PIN" ] || fail "Unexpected release signing identity."
    [ "$URL" = "$BASE/releases/Clutter_$VERSION"_universal.zip ] || fail "This release predates Terminal installation. Use the DMG or try the next release."
    [[ "$SHA" =~ ^[a-f0-9]{64}$ ]] || fail "This release lacks Terminal installer integrity metadata."
    case "$SIGNING" in
        adhoc|developer-id) ;;
        *) fail "Unknown signing mode." ;;
    esac
    printf 'Installing Clutter %s\n\n' "$VERSION"
    printf 'Downloading Clutter...\n'
    download "$URL" "$WORK/Clutter.zip"
    [ "$(stat -f%z "$WORK/Clutter.zip")" = "$SIZE" ] || fail "Download size mismatch."
    actual=$(shasum -a 256 "$WORK/Clutter.zip")
    [ "$actual" = "$SHA  $WORK/Clutter.zip" ] || fail "Download checksum mismatch."
    printf 'Verifying application...\n'
    mkdir "$WORK/extracted"
    ditto -x -k "$WORK/Clutter.zip" "$WORK/extracted"
    APP="$WORK/extracted/Clutter.app"
    [ -d "$APP" ] && [ ! -L "$APP" ] || fail "Missing application."
    verify_app() {
        local app="$1"
        local info="$app/Contents/Info.plist"
        local signature
        codesign --verify --deep --strict --all-architectures "$app"
        [ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$info")" = com.vigram.clutter ] || fail "Wrong bundle identifier."
        [ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$info")" = "$VERSION" ] || fail "Wrong app version."
        [ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$info")" = "$BUILD" ] || fail "Wrong build number."
        [ "$(/usr/libexec/PlistBuddy -c 'Print :SUPublicEDKey' "$info")" = "$PIN" ] || fail "Wrong embedded updater key."
        [ "$(/usr/libexec/PlistBuddy -c 'Print :SUFeedURL' "$info")" = "$BASE/appcast.xml" ] || fail "Wrong update endpoint."
        signature=$(codesign -d --verbose=4 "$app" 2>&1)
        if [ "$SIGNING" = developer-id ]; then
            printf '%s\n' "$signature" | grep -q '^Authority=Developer ID Application:' || fail "Missing Developer ID signature."
            spctl --assess --type execute "$app" || fail "macOS rejected the release."
        else
            printf '%s\n' "$signature" | grep -q '^Signature=adhoc$' || fail "Unexpected beta signature."
        fi
    }
    verify_app "$APP"
    printf 'Installing Clutter...\n'
    STAGE=$(mktemp -d /Applications/.clutter-install.XXXXXX)
    ditto "$APP" "$STAGE/Clutter.app"
    verify_app "$STAGE/Clutter.app"
    [ ! -e "$DEST" ] && [ ! -L "$DEST" ] || fail "An installation appeared during download; refusing to overwrite."
    # Move into the parent directory on the same filesystem, with no-clobber.
    mv -n "$STAGE/Clutter.app" /Applications/
    [ ! -e "$STAGE/Clutter.app" ] && [ -d "$DEST" ] || fail "Installation destination is occupied."
    printf '\n✓ Clutter installed successfully\n'
    printf 'Launching Clutter...\n'
    if ! open "$DEST"; then
        printf 'Clutter is installed, but macOS could not launch it. Open it from Applications.\n' >&2
        if [ "$SIGNING" = adhoc ]; then
            printf 'This beta is not notarized by Apple; macOS may require approval.\n' >&2
        fi
        exit 1
    fi
)
main
`;
\033[2m'
        YELLOW=
    if grep -Eq '<!DOCTYPE|<!ENTITY' "$WORK/feed.xml"; then fail "Unexpected XML declarations."; fi
    xml() { xmllint --nonet --xpath "$1" "$WORK/feed.xml"; }
    [ "$(xml 'count(/rss/channel/item)')" = 1 ] || fail "Unexpected release feed."
    [ "$(xml 'count(/rss/channel/item/enclosure)')" = 1 ] || fail "Unexpected release archive."
    VERSION=$(xml "string(/rss/channel/item/*[local-name()='shortVersionString' and namespace-uri()='$SPARKLE_NS'])")
    BUILD=$(xml "string(/rss/channel/item/*[local-name()='version' and namespace-uri()='$SPARKLE_NS'])")
    KEY=$(xml "string(/rss/channel/*[local-name()='signingPublicKey' and namespace-uri()='$NS'])")
    SIGNING=$(xml "string(/rss/channel/*[local-name()='codeSigning' and namespace-uri()='$NS'])")
    SHA=$(xml "string(/rss/channel/item/enclosure/@*[local-name()='sha256' and namespace-uri()='$NS'])")
    URL=$(xml 'string(/rss/channel/item/enclosure/@url)')
    SIZE=$(xml 'string(/rss/channel/item/enclosure/@length)')
    [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && "$BUILD" =~ ^[0-9]+$ && "$SIZE" =~ ^[1-9][0-9]*$ ]] || fail "Invalid release metadata."
    [ "$KEY" = "$PIN" ] || fail "Unexpected release signing identity."
    [ "$URL" = "$BASE/releases/Clutter_$VERSION"_universal.zip ] || fail "This release predates Terminal installation. Use the DMG or try the next release."
    [[ "$SHA" =~ ^[a-f0-9]{64}$ ]] || fail "This release lacks Terminal installer integrity metadata."
    case "$SIGNING" in
        adhoc|developer-id) ;;
        *) fail "Unknown signing mode." ;;
    esac
    printf 'Installing Clutter %s\n\n' "$VERSION"
    printf 'Downloading Clutter...\n'
    download "$URL" "$WORK/Clutter.zip"
    [ "$(stat -f%z "$WORK/Clutter.zip")" = "$SIZE" ] || fail "Download size mismatch."
    actual=$(shasum -a 256 "$WORK/Clutter.zip")
    [ "$actual" = "$SHA  $WORK/Clutter.zip" ] || fail "Download checksum mismatch."
    printf 'Verifying application...\n'
    mkdir "$WORK/extracted"
    ditto -x -k "$WORK/Clutter.zip" "$WORK/extracted"
    APP="$WORK/extracted/Clutter.app"
    [ -d "$APP" ] && [ ! -L "$APP" ] || fail "Missing application."
    verify_app() {
        local app="$1"
        local info="$app/Contents/Info.plist"
        local signature
        codesign --verify --deep --strict --all-architectures "$app"
        [ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$info")" = com.vigram.clutter ] || fail "Wrong bundle identifier."
        [ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$info")" = "$VERSION" ] || fail "Wrong app version."
        [ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$info")" = "$BUILD" ] || fail "Wrong build number."
        [ "$(/usr/libexec/PlistBuddy -c 'Print :SUPublicEDKey' "$info")" = "$PIN" ] || fail "Wrong embedded updater key."
        [ "$(/usr/libexec/PlistBuddy -c 'Print :SUFeedURL' "$info")" = "$BASE/appcast.xml" ] || fail "Wrong update endpoint."
        signature=$(codesign -d --verbose=4 "$app" 2>&1)
        if [ "$SIGNING" = developer-id ]; then
            printf '%s\n' "$signature" | grep -q '^Authority=Developer ID Application:' || fail "Missing Developer ID signature."
            spctl --assess --type execute "$app" || fail "macOS rejected the release."
        else
            printf '%s\n' "$signature" | grep -q '^Signature=adhoc$' || fail "Unexpected beta signature."
        fi
    }
    verify_app "$APP"
    printf 'Installing Clutter...\n'
    STAGE=$(mktemp -d /Applications/.clutter-install.XXXXXX)
    ditto "$APP" "$STAGE/Clutter.app"
    verify_app "$STAGE/Clutter.app"
    [ ! -e "$DEST" ] && [ ! -L "$DEST" ] || fail "An installation appeared during download; refusing to overwrite."
    # Move into the parent directory on the same filesystem, with no-clobber.
    mv -n "$STAGE/Clutter.app" /Applications/
    [ ! -e "$STAGE/Clutter.app" ] && [ -d "$DEST" ] || fail "Installation destination is occupied."
    printf '\n✓ Clutter installed successfully\n'
    printf 'Launching Clutter...\n'
    if ! open "$DEST"; then
        printf 'Clutter is installed, but macOS could not launch it. Open it from Applications.\n' >&2
        if [ "$SIGNING" = adhoc ]; then
            printf 'This beta is not notarized by Apple; macOS may require approval.\n' >&2
        fi
        exit 1
    fi
)
main
`;
\033[33m'
        RESET=
    if grep -Eq '<!DOCTYPE|<!ENTITY' "$WORK/feed.xml"; then fail "Unexpected XML declarations."; fi
    xml() { xmllint --nonet --xpath "$1" "$WORK/feed.xml"; }
    [ "$(xml 'count(/rss/channel/item)')" = 1 ] || fail "Unexpected release feed."
    [ "$(xml 'count(/rss/channel/item/enclosure)')" = 1 ] || fail "Unexpected release archive."
    VERSION=$(xml "string(/rss/channel/item/*[local-name()='shortVersionString' and namespace-uri()='$SPARKLE_NS'])")
    BUILD=$(xml "string(/rss/channel/item/*[local-name()='version' and namespace-uri()='$SPARKLE_NS'])")
    KEY=$(xml "string(/rss/channel/*[local-name()='signingPublicKey' and namespace-uri()='$NS'])")
    SIGNING=$(xml "string(/rss/channel/*[local-name()='codeSigning' and namespace-uri()='$NS'])")
    SHA=$(xml "string(/rss/channel/item/enclosure/@*[local-name()='sha256' and namespace-uri()='$NS'])")
    URL=$(xml 'string(/rss/channel/item/enclosure/@url)')
    SIZE=$(xml 'string(/rss/channel/item/enclosure/@length)')
    [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && "$BUILD" =~ ^[0-9]+$ && "$SIZE" =~ ^[1-9][0-9]*$ ]] || fail "Invalid release metadata."
    [ "$KEY" = "$PIN" ] || fail "Unexpected release signing identity."
    [ "$URL" = "$BASE/releases/Clutter_$VERSION"_universal.zip ] || fail "This release predates Terminal installation. Use the DMG or try the next release."
    [[ "$SHA" =~ ^[a-f0-9]{64}$ ]] || fail "This release lacks Terminal installer integrity metadata."
    case "$SIGNING" in
        adhoc|developer-id) ;;
        *) fail "Unknown signing mode." ;;
    esac
    printf 'Installing Clutter %s\n\n' "$VERSION"
    printf 'Downloading Clutter...\n'
    download "$URL" "$WORK/Clutter.zip"
    [ "$(stat -f%z "$WORK/Clutter.zip")" = "$SIZE" ] || fail "Download size mismatch."
    actual=$(shasum -a 256 "$WORK/Clutter.zip")
    [ "$actual" = "$SHA  $WORK/Clutter.zip" ] || fail "Download checksum mismatch."
    printf 'Verifying application...\n'
    mkdir "$WORK/extracted"
    ditto -x -k "$WORK/Clutter.zip" "$WORK/extracted"
    APP="$WORK/extracted/Clutter.app"
    [ -d "$APP" ] && [ ! -L "$APP" ] || fail "Missing application."
    verify_app() {
        local app="$1"
        local info="$app/Contents/Info.plist"
        local signature
        codesign --verify --deep --strict --all-architectures "$app"
        [ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$info")" = com.vigram.clutter ] || fail "Wrong bundle identifier."
        [ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$info")" = "$VERSION" ] || fail "Wrong app version."
        [ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$info")" = "$BUILD" ] || fail "Wrong build number."
        [ "$(/usr/libexec/PlistBuddy -c 'Print :SUPublicEDKey' "$info")" = "$PIN" ] || fail "Wrong embedded updater key."
        [ "$(/usr/libexec/PlistBuddy -c 'Print :SUFeedURL' "$info")" = "$BASE/appcast.xml" ] || fail "Wrong update endpoint."
        signature=$(codesign -d --verbose=4 "$app" 2>&1)
        if [ "$SIGNING" = developer-id ]; then
            printf '%s\n' "$signature" | grep -q '^Authority=Developer ID Application:' || fail "Missing Developer ID signature."
            spctl --assess --type execute "$app" || fail "macOS rejected the release."
        else
            printf '%s\n' "$signature" | grep -q '^Signature=adhoc$' || fail "Unexpected beta signature."
        fi
    }
    verify_app "$APP"
    printf 'Installing Clutter...\n'
    STAGE=$(mktemp -d /Applications/.clutter-install.XXXXXX)
    ditto "$APP" "$STAGE/Clutter.app"
    verify_app "$STAGE/Clutter.app"
    [ ! -e "$DEST" ] && [ ! -L "$DEST" ] || fail "An installation appeared during download; refusing to overwrite."
    # Move into the parent directory on the same filesystem, with no-clobber.
    mv -n "$STAGE/Clutter.app" /Applications/
    [ ! -e "$STAGE/Clutter.app" ] && [ -d "$DEST" ] || fail "Installation destination is occupied."
    printf '\n✓ Clutter installed successfully\n'
    printf 'Launching Clutter...\n'
    if ! open "$DEST"; then
        printf 'Clutter is installed, but macOS could not launch it. Open it from Applications.\n' >&2
        if [ "$SIGNING" = adhoc ]; then
            printf 'This beta is not notarized by Apple; macOS may require approval.\n' >&2
        fi
        exit 1
    fi
)
main
`;
\033[0m'
    fi
    step_done() {
        printf '%s✓%s %s%s%s\n' "$GREEN" "$RESET" "$MUTED" "$1" "$RESET"
    }
    printf '\n%sInstalling Clutter...%s\n\n' "$BOLD" "$RESET"

    download "$BASE/appcast.xml" "$WORK/feed.xml"
    if grep -Eq '<!DOCTYPE|<!ENTITY' "$WORK/feed.xml"; then fail "Unexpected XML declarations."; fi
    xml() { xmllint --nonet --xpath "$1" "$WORK/feed.xml"; }
    [ "$(xml 'count(/rss/channel/item)')" = 1 ] || fail "Unexpected release feed."
    [ "$(xml 'count(/rss/channel/item/enclosure)')" = 1 ] || fail "Unexpected release archive."
    VERSION=$(xml "string(/rss/channel/item/*[local-name()='shortVersionString' and namespace-uri()='$SPARKLE_NS'])")
    BUILD=$(xml "string(/rss/channel/item/*[local-name()='version' and namespace-uri()='$SPARKLE_NS'])")
    KEY=$(xml "string(/rss/channel/*[local-name()='signingPublicKey' and namespace-uri()='$NS'])")
    SIGNING=$(xml "string(/rss/channel/*[local-name()='codeSigning' and namespace-uri()='$NS'])")
    SHA=$(xml "string(/rss/channel/item/enclosure/@*[local-name()='sha256' and namespace-uri()='$NS'])")
    URL=$(xml 'string(/rss/channel/item/enclosure/@url)')
    SIZE=$(xml 'string(/rss/channel/item/enclosure/@length)')
    [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && "$BUILD" =~ ^[0-9]+$ && "$SIZE" =~ ^[1-9][0-9]*$ ]] || fail "Invalid release metadata."
    [ "$KEY" = "$PIN" ] || fail "Unexpected release signing identity."
    [ "$URL" = "$BASE/releases/Clutter_$VERSION"_universal.zip ] || fail "This release predates Terminal installation. Use the DMG or try the next release."
    [[ "$SHA" =~ ^[a-f0-9]{64}$ ]] || fail "This release lacks Terminal installer integrity metadata."
    case "$SIGNING" in
        adhoc|developer-id) ;;
        *) fail "Unknown signing mode." ;;
    esac
    printf 'Installing Clutter %s\n\n' "$VERSION"
    printf 'Downloading Clutter...\n'
    download "$URL" "$WORK/Clutter.zip"
    [ "$(stat -f%z "$WORK/Clutter.zip")" = "$SIZE" ] || fail "Download size mismatch."
    actual=$(shasum -a 256 "$WORK/Clutter.zip")
    [ "$actual" = "$SHA  $WORK/Clutter.zip" ] || fail "Download checksum mismatch."
    printf 'Verifying application...\n'
    mkdir "$WORK/extracted"
    ditto -x -k "$WORK/Clutter.zip" "$WORK/extracted"
    APP="$WORK/extracted/Clutter.app"
    [ -d "$APP" ] && [ ! -L "$APP" ] || fail "Missing application."
    verify_app() {
        local app="$1"
        local info="$app/Contents/Info.plist"
        local signature
        codesign --verify --deep --strict --all-architectures "$app"
        [ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$info")" = com.vigram.clutter ] || fail "Wrong bundle identifier."
        [ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$info")" = "$VERSION" ] || fail "Wrong app version."
        [ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$info")" = "$BUILD" ] || fail "Wrong build number."
        [ "$(/usr/libexec/PlistBuddy -c 'Print :SUPublicEDKey' "$info")" = "$PIN" ] || fail "Wrong embedded updater key."
        [ "$(/usr/libexec/PlistBuddy -c 'Print :SUFeedURL' "$info")" = "$BASE/appcast.xml" ] || fail "Wrong update endpoint."
        signature=$(codesign -d --verbose=4 "$app" 2>&1)
        if [ "$SIGNING" = developer-id ]; then
            printf '%s\n' "$signature" | grep -q '^Authority=Developer ID Application:' || fail "Missing Developer ID signature."
            spctl --assess --type execute "$app" || fail "macOS rejected the release."
        else
            printf '%s\n' "$signature" | grep -q '^Signature=adhoc$' || fail "Unexpected beta signature."
        fi
    }
    verify_app "$APP"
    printf 'Installing Clutter...\n'
    STAGE=$(mktemp -d /Applications/.clutter-install.XXXXXX)
    ditto "$APP" "$STAGE/Clutter.app"
    verify_app "$STAGE/Clutter.app"
    [ ! -e "$DEST" ] && [ ! -L "$DEST" ] || fail "An installation appeared during download; refusing to overwrite."
    # Move into the parent directory on the same filesystem, with no-clobber.
    mv -n "$STAGE/Clutter.app" /Applications/
    [ ! -e "$STAGE/Clutter.app" ] && [ -d "$DEST" ] || fail "Installation destination is occupied."
    printf '\n✓ Clutter installed successfully\n'
    printf 'Launching Clutter...\n'
    if ! open "$DEST"; then
        printf 'Clutter is installed, but macOS could not launch it. Open it from Applications.\n' >&2
        if [ "$SIGNING" = adhoc ]; then
            printf 'This beta is not notarized by Apple; macOS may require approval.\n' >&2
        fi
        exit 1
    fi
)
main
`;
