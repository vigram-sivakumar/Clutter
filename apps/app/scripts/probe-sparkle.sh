#!/bin/bash
# Isolated macOS sandbox + ad-hoc signing update probe. Does not build, modify or publish Clutter.
set -euo pipefail
if [ "$(uname -s)" != Darwin ] || [ "$(uname -m)" != arm64 ]; then
  echo 'Run on an Apple Silicon Mac with Xcode command-line tools.' >&2; exit 1
fi
xcrun --find clang >/dev/null
command -v python3 >/dev/null
VERSION=2.10.1
ID=com.vigram.clutter.sparkleprobe
PORT=18765
WORK=$(mktemp -d "${TMPDIR:-/tmp}/clutter-sparkle-probe.XXXXXX")
DIST="$WORK/sparkle"
mkdir -p "$DIST" "$WORK/initial" "$WORK/next" "$WORK/feed"
echo "Probe directory: $WORK"
# Use the official pinned release; optionally supply a locally downloaded official archive.
ARCHIVE=${1:-"$WORK/Sparkle-$VERSION.tar.xz"}
if [ "$#" -eq 0 ]; then
  curl --fail --location --silent --show-error --proto '=https' --proto-redir '=https' \
    "https://github.com/sparkle-project/Sparkle/releases/download/$VERSION/Sparkle-$VERSION.tar.xz" -o "$ARCHIVE"
fi
tar -xf "$ARCHIVE" -C "$DIST"
FRAMEWORK=$(find "$DIST" -type d -name Sparkle.framework -print -quit)
KEY_TOOL=$(find "$DIST" -type f -name generate_keys -print -quit)
SIGN_TOOL=$(find "$DIST" -type f -name sign_update -print -quit)
[ -n "$FRAMEWORK" ] && [ -x "$KEY_TOOL" ] && [ -x "$SIGN_TOOL" ] || {
  echo 'Sparkle distribution missing required framework or tools.' >&2; exit 1;
}
[ -d "$FRAMEWORK/Versions/B/XPCServices/Installer.xpc" ] || { echo 'Missing Installer.xpc' >&2; exit 1; }
codesign --verify --deep --strict "$FRAMEWORK"
# Use a dedicated Keychain account; never use or export Clutter's production signing key.
"$KEY_TOOL" --account "$ID"
PUBLIC_KEY=$("$KEY_TOOL" --account "$ID" -p | tr -d '\r\n')
[[ "$PUBLIC_KEY" =~ ^[A-Za-z0-9+/]{43}=$ ]] || { echo 'Expected a 32-byte base64 public key.' >&2; exit 1; }
cat > "$WORK/entitlements.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>com.apple.security.app-sandbox</key><true/>
<key>com.apple.security.files.user-selected.read-write</key><true/>
<key>com.apple.security.files.bookmarks.app-scope</key><true/>
<key>com.apple.security.network.client</key><true/>
<key>com.apple.security.temporary-exception.mach-lookup.global-name</key>
<array><string>$ID-spks</string><string>$ID-spki</string></array>
</dict></plist>
EOF
cat > "$WORK/main.m" <<'EOF'
#import <Cocoa/Cocoa.h>
#import <Sparkle/Sparkle.h>

@interface ProbeDelegate : NSObject <NSApplicationDelegate>
@property(nonatomic, strong) NSWindow *window;
@property(nonatomic, strong) SPUStandardUpdaterController *controller;
@end

@implementation ProbeDelegate
- (void)applicationDidFinishLaunching:(NSNotification *)note {
    self.controller = [[SPUStandardUpdaterController alloc] initWithStartingUpdater:YES updaterDelegate:nil userDriverDelegate:nil];
    self.window = [[NSWindow alloc] initWithContentRect:NSMakeRect(0, 0, 440, 200)
        styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskClosable
        backing:NSBackingStoreBuffered defer:NO];
    self.window.releasedWhenClosed = NO;
    self.window.title = @"Clutter Sparkle Probe";
    NSString *version = [NSBundle.mainBundle objectForInfoDictionaryKey:@"CFBundleShortVersionString"];
    NSTextField *label = [NSTextField labelWithString:[NSString stringWithFormat:@"Installed version: %@", version]];
    label.frame = NSMakeRect(24, 130, 390, 24);
    [self.window.contentView addSubview:label];
    NSButton *button = [NSButton buttonWithTitle:@"Check for Updates" target:self.controller action:@selector(checkForUpdates:)];
    button.frame = NSMakeRect(24, 70, 200, 32);
    [self.window.contentView addSubview:button];
    [self.window center];
    [self.window makeKeyAndOrderFront:nil];
    [NSApp activateIgnoringOtherApps:YES];
}
- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)app { return YES; }
@end

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        NSApplication *app = NSApplication.sharedApplication;
        [app setActivationPolicy:NSApplicationActivationPolicyRegular];
        static ProbeDelegate *delegate;
        delegate = [ProbeDelegate new];
        app.delegate = delegate;
        [app run];
    }
    return 0;
}
EOF
build_app() {
  local dest="$1" marketing="$2" build="$3"
  local app="$dest/Clutter Sparkle Probe.app"
  mkdir -p "$app/Contents/MacOS" "$app/Contents/Frameworks"
  ditto "$FRAMEWORK" "$app/Contents/Frameworks/Sparkle.framework"
  cat > "$app/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>$ID</string>
<key>CFBundleName</key><string>Clutter Sparkle Probe</string>
<key>CFBundleDisplayName</key><string>Clutter Sparkle Probe</string>
<key>CFBundleExecutable</key><string>probe</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>$marketing</string>
<key>CFBundleVersion</key><string>$build</string>
<key>LSMinimumSystemVersion</key><string>13.3</string>
<key>NSHighResolutionCapable</key><true/>
<key>SUFeedURL</key><string>http://localhost:$PORT/appcast.xml</string>
<key>SUPublicEDKey</key><string>$PUBLIC_KEY</string>
<key>SUEnableInstallerLauncherService</key><true/>
<key>SUEnableDownloaderService</key><false/>
<key>SUEnableAutomaticChecks</key><false/>
<key>SUAutomaticallyUpdate</key><false/>
<key>SUVerifyUpdateBeforeExtraction</key><true/>
<key>SUShowReleaseNotes</key><false/>
<key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict></plist>
EOF
  plutil -lint "$app/Contents/Info.plist" "$WORK/entitlements.plist"
  xcrun clang -arch arm64 -mmacosx-version-min=13.3 -fobjc-arc \
    -F"$(dirname "$FRAMEWORK")" -framework Cocoa -framework Sparkle \
    -Wl,-rpath,@executable_path/../Frameworks "$WORK/main.m" -o "$app/Contents/MacOS/probe"
  # Leave the official nested Sparkle helper signatures and entitlements intact.
  codesign --force --sign - --timestamp=none --entitlements "$WORK/entitlements.plist" "$app"
  codesign --verify --deep --strict "$app"
}
build_app "$WORK/initial" 0.0.1 1
build_app "$WORK/next" 0.0.2 2
ZIP="$WORK/feed/Clutter-Sparkle-Probe-0.0.2.zip"
ditto -c -k --sequesterRsrc --keepParent "$WORK/next/Clutter Sparkle Probe.app" "$ZIP"
SIG=$("$SIGN_TOOL" --account "$ID" -p "$ZIP" | tr -d '\r\n')
[[ "$SIG" =~ ^[A-Za-z0-9+/]{86}==$ ]] || { echo 'Expected a 64-byte base64 archive signature.' >&2; exit 1; }
LENGTH=$(stat -f%z "$ZIP")
cat > "$WORK/feed/appcast.xml" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
<channel><title>Clutter Sparkle Probe</title>
<item><title>Version 0.0.2</title>
<sparkle:version>2</sparkle:version>
<sparkle:shortVersionString>0.0.2</sparkle:shortVersionString>
<sparkle:minimumSystemVersion>13.3</sparkle:minimumSystemVersion>
<enclosure url="http://localhost:$PORT/Clutter-Sparkle-Probe-0.0.2.zip" length="$LENGTH" type="application/octet-stream" sparkle:edSignature="$SIG"/>
</item></channel></rss>
EOF
plutil -lint "$WORK/initial/Clutter Sparkle Probe.app/Contents/Info.plist"
echo
echo 'Both signed sandboxed probe bundles were built.'
echo 'In Finder, copy Clutter Sparkle Probe.app from the opened folder into /Applications.'
echo 'Launch the installed PROBE (not Clutter), verify 0.0.1, check for updates, then install and relaunch.'
echo 'PASS only if the relaunched probe reports 0.0.2 and remains sandboxed.'
echo 'Keep this Terminal running until the test finishes. Ctrl+C stops the local-only feed.'
echo "Probe directory: $WORK"
open "$WORK/initial"
exec python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$WORK/feed"
