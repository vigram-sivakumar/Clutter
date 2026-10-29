# Sandbox test harness (local tooling, untracked)

Drives a real, sandboxed build of Clutter with WebDriver, to test Documents authorization, security-scoped bookmarks,
atomic saves, file watching, import and failed-restore handling. See `docs/building-and-distribution.md` ("Release
checklist and verification baseline") for what it covered and what it did not.

**Local only.** The specs name this machine's paths (`/Users/sivakuv3`), and the scripts in `tools/` were written against
a session scratch directory (`/private/tmp/claude-502/.../scratchpad/sandbox`, read from `/private/tmp/claude-502/sbx_path`).
Adapt both before reusing it on another machine or in a new session.

## Layout

- `wdio.sandbox.conf.ts`: refuses to run unless `CLUTTER_SANDBOX_BINARY` is the test bundle
  (`Clutter Sandbox Test.app/Contents/MacOS/app`).
- `specs-accept/`: the acceptance suite, one file per launch, in order `a1 a2 a3 a4 b1 b2 b3 c1 c2` (9 files, 22 checks;
  the last full pass was on a build of commit `f70a4ceb`). State carries between files on purpose (relaunch tests).
- `specs/`: the earlier sandbox specs (autosave, crash recovery, editor-versus-disk conflict, watcher, restart). They
  passed once on an early build and have **not** been re-run on the final code.
- `specs-diag/`: throw-away diagnostics.
- `tools/`: `entitlements.plist` (the app's entitlements plus `network.server`, which the WebDriver server needs; never
  ship it), `tauri.sbx.json` (the override: product name, the test identifier `com.clutter.sandboxtest`, frontend
  paths), `clean-and-run.sh` (stops the test app, wipes only the test identity's container and the disposable folders,
  verifies the start is clean), `run-sandbox.sh`, `seq-final.sh` / `seq2.sh` (the ordered runs), `safekey.sh` (the key
  sender, below).

## Building the test bundle

```bash
cd apps/app
CARGO_TARGET_DIR=<scratch>/target ../../node_modules/.bin/tauri build \
  --config <scratch>/tauri.sbx.json --features automation --bundles app
npm run verify:bundle -- "<scratch>/target/release/bundle/macos/Clutter Sandbox Test.app" --local --allow-test-harness
```

## Safety rules (learned the hard way)

- The system file panel runs in another process. `tools/safekey.sh` sends a key **only** while that panel is up, and it
  identifies the test app by **bundle identifier** (`com.clutter.sandboxtest`), never by the executable name `app`
  (the development build shares it) and never with `pkill -f` on a broad pattern. Never send keys blindly: an earlier
  version did, and the keys went to whatever app was in front.
- Never stop processes by name patterns that could match a developer's own `vite` or `tauri dev`; stop by PID or port.
- The specs create disposable folders (`~/Documents/ClutterSbxAccept`, `/Users/Shared/zz-sbx-existing-space`,
  `/private/tmp/zz-sbx-*`) and the grant lives in the test identity's own container. Remove them afterwards.
- The panel appears on screen several times per run (about eight minutes in total); do not run it during a call.
