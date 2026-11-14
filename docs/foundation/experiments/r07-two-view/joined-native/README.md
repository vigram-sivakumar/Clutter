# Joined macOS qualification runner16

Revision0.40. Prepared AppKit/WKWebView runner for the joined core. **Native build
and execution have not run on the Linux preparation host.** Eight Linux helper
checks exercise packaged processes, discovery and the JavaScript close/handoff
route; they do not pass JG-11 or native keyboard input.

## Start on the Mac

From this experiment package directory:

```sh
npm ci --ignore-scripts --workspaces=false
npm run native:joined
```

The build driver needs Node22+ and existing locked dependencies, macOS14+ and Xcode
Command Line Tools. It downloads a checksum-pinned official Node24.22.1 archive for
the current arm64/x64 architecture on first run. The app and headless clients use
that bundled runtime, not the developer's globally installed Node. Archive hashes
are in [runtime lock](runtime-lock.json), checked against the
[official checksum list](https://nodejs.org/download/release/v24.22.1/SHASUMS256.txt).
No Mac archive was downloaded/executed during Linux preparation; an incompatible
SQLite build fails closed during actual setup.

The runner compiles the separate Swift host, signs Node/host/app ad hoc and verifies
the bundle. It rejects non-system runtime dylib dependencies. It creates a fresh
0700 marked synthetic session in the OS temporary directory, then runs headless
CLI/MCP checks **before opening any native window**. These first insert `HEADLESS `
before Alpha, intentionally visible when the window opens. Setup records actual
runtime/SQLite/source/OS/filesystem and PRAGMA profile. A setup pass is not a native
input pass.

When the joined window is ready, start **JN-01 only**. Do not replay the old R07
manual catalogue. JN-01–04 have short, specific instructions in the native picker;
manual verdicts/attempts and captures save separately from automated evidence.
IME remains unavailable and VoiceOver deferred. The runner does not mark them passed.

The terminal prints the actual report path and a fully quoted packaged CLI command.
After Command-Q, that command reads the same document with no desktop/global Node.
The synthetic owner intentionally stays alive until the printed `--control stop`
command. No automatic idle-host policy is selected. If the supervisor itself dies, its
writer drains and exits on IPC disconnect so a known endpoint cannot become an
uncontrollable orphan; this is distinct from desktop closure. Keep the session during checks;
temporary OS cleanup/reboot is not a promised long-term vault retention policy.

## Ownership and lifecycle

The packaged `owner.mjs` remains the sole SQLite/Y writer and uses the shared Store/
HTTP host/model mechanics. The detached service only launches/supervises it and
publishes a private descriptor after ownership. Contenders attach to that owner;
a stale descriptor is never proof that an old writer has stopped. SQLite fencing
and a fresh epoch/token, not a PID timeout, govern actual restart.

Private sessions/descriptors enforce same-user ownership, modes and canonical path;
component fingerprints reject mixed bundles. Loopback control is a **separate**
test channel with its own random token from the private descriptor. Test controls
are not document/CLI/MCP domain commands. Unix sockets were unavailable on the
preparation host; the final implementation uses authenticated loopback TCP. This
is a same-user lab protocol, not production peer credentials/grant issuance.

The native close delegate waits for `prepareClose`: protect every pending context
before hiding a window; failed protection blocks close. Reopening the hidden window
keeps the same WK context alive. Quitting additionally records explicit context
handoff so abandoned work can be recovered while the owner continues running.
The native fixture uses a distinct marker/schema2 and a `context_releases` table;
it does not fake owner epochs, migrate schema1 stores or add a second document body.
New protection generations become live-owned again; prior release cannot retire a
newer draft. Explicit restore still checks the current base and preserves conflicts.

This profile has one native window and fixed synthetic A/B context grants. It does
not qualify multiple independent native clients with production lease issuance.
The existing semantic command/engine boundary is shared; platform lifecycle code
contains no duplicate task/document policy. A native host may later be Rust/Tauri,
but this Swift test host does not select either production shell.

## Flush and acceptance limits

The Mac owner requires and reads back SQLite `fullfsync=ON` and
`checkpoint_fullfsync=ON`, in addition to WAL/FULL/exclusive. Linux helper runs leave
these native requirements off and are labelled accordingly. This is a requested/
read-back configuration on an actual Mac, not instrumentation proving physical
power-loss behavior. Follow the actual OS/filesystem contract before approval;
never infer the old ADR full-flush guarantee from SQL settings or a clean quit.

App signing is ad hoc, not notarization, App Store sandbox or distribution approval.
Complete JG-11 includes actual native observations and remaining platform/security
review; no preparation result accepts it. Production entity/restore closure JG-12,
external PNG/PDF publication JG-13, scale, full security and provider gates remain.
[Result and next action](../../../r08-native-runner.md) keep these explicit.

`artifacts/joined-native-setup.json` records setup/blocked reasons. Native JSON is
`artifacts/joined-native-<timestamp>.json`. Build/runtime downloads live in ignored
`joined-native/out/`; session descriptors/tokens are private and must not be shared.
Share setup/native JSON reports, not `endpoint.json` or the private session folder.

## Signing correction17

The first user Mac run compiled this Swift host, then16 signing failed on the CLI
shell script placed in Contents/MacOS.17 packages the script as Resources/bin/clutter-lab
and seals its fingerprint; its runtime/client paths are relative to Resources.
The outer app signs the main executable after resources are complete, with strict
verification retained. Run native:joined again after applying17. No new dependency
install, runtime-cache deletion or manual repair of the failed bundle is needed.
Mac signing remains unverified until that retry; Linux helper success is not signing
acceptance. See [Apple's layout guidance](https://developer.apple.com/library/archive/technotes/tn2206/_index.html).

## Stylesheet correction18

If the joined app appears in a default serif font with A/B stacked and borderless
tables, host CSP is blocking its own stylesheets.18 enables same-origin styles and
adds computed-layout regression checks. Quit the test app and run native:joined
after applying18; verify side-by-side styled views before testing JN-01. No cache
clearing or dependency reinstall is required.
