# Joined Mac runner preparation

Revision0.40, 2026-11-14. **Runner prepared; actual Mac compilation/execution and
JG-11 acceptance remain not-run.** Eight Linux checks pass for the packaged
process/discovery/lifecycle helpers, with the earlier joined/storage regressions.
Do not count these as native input, signing, archive execution or distribution proof.

[Runner guide](experiments/r07-two-view/joined-native/README.md) owns launch steps;
[evidence](evidence/r08-16-2026-11-14.json) retains exact runs and limitations.
The user requested proceeding after the corrected bundle15 apply command; its
application was not explicitly confirmed. Delivery preflights exact13/14/15 rather
than guessing. Existing product rules and prior manual observations remain intact.

## Prepared Mac route

`npm run native:joined` builds an isolated AppKit/WKWebView host around the actual
joined editors, packages the existing owner/CLI/MCP with a pinned Node24.22.1
runtime, signs the executable components/app ad hoc and verifies its bundle.
Runtime archives for arm64/x64 are pinned to hashes retrieved from Node's official
checksum list, not to whichever developer Node happens to be installed. Setup
checks actual SQLite capabilities/version and the Mac flush profile before opening
the window. The builder still needs development dependencies; the packaged runtime
path is what supports app-closed CLI/MCP use without global Node at runtime.

A fresh private marked synthetic session is used, never production data. Before
launching any native window, CLI and MCP race/retry operations against the detached
owner and check one original receipt/effect. The intentional `HEADLESS ` insertion
appears in the note as evidence that the native view reads the same durable root.
The terminal prints native/setup JSON locations and quoted headless read/stop
commands. The owner stays independent of the app/builder and is explicitly stopped
at the end of the experiment; no production idle-host policy is selected.

The native window has four focused cases: history/remount, table keyboard/focus,
failed-save close protection, and restart/app-closed continuity. Start JN-01 only
when the window is ready. Native Edit menu actions use the responder chain. Async
close/quit waits for acknowledged protection; failure leaves the window open.
Manual attempts/captures are recorded separately from automated setup checks.
The old R07 Swift harness is untouched and is not a substitute for this runner.

## Context handoff and one owner

Window hide/reopen preserves its WK editing contexts and performs revision catch-up.
Quit is different: after pending work is protected, explicit context release makes
that work recoverable even though the authority remains alive. This closes a gap
that an owner-epoch-only recovery test cannot cover. The native fixture has its
own marker and SQL schema2 `context_releases` metadata. It reuses the Y root codec
and shared Store commit/recovery machinery; it does not invent owner epochs or
migrate schema1 stores. New protection generations supersede old release metadata.
Explicit restore still refuses stale bases and retains conflicts.

The detached supervisor owns launch/discovery mechanics, not document state. The
child alone owns SQLite. If the supervisor itself disappears, its writer drains
on IPC disconnect; desktop closure does not disconnect that independent supervisor.
No heartbeat/PID-file takeover or independent direct-store client is introduced.

Sessions/descriptors are same-user, canonical-path and mode checked. Bundle
fingerprints prevent mismatched clients silently starting another implementation.
A separate authenticated loopback TCP channel carries test controls; it is not a
domain command surface. The initial Unix-socket implementation was blocked by
EPERM on this host; that failed run/probe and a leftover-reference correction are
retained. The final test-control transport has its own random private token.
These mechanisms are a test bootstrap, not complete production peer credentials,
grants, path-alias election or sandbox validation.

## Executed preparation evidence

| Check | Actual Linux result                                                                                                                      |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| NP-01 | Unsupported host/preflight and corrupted pinned archive fail closed; no Mac result fabricated                                            |
| NP-02 | Private session, wrong file mode and symlink validation                                                                                  |
| NP-03 | Packed Linux Node copy + bundled owner/client code; concurrent app-closed CLI/MCP use one owner and original receipt                     |
| NP-04 | Actual Chromium editors invoke the same JS close guard, block failed protection and reopen after protection; not a physical native close |
| NP-05 | Released context recovers with the same live authority; no desktop-owned SQL lifetime                                                    |
| NP-06 | Actual child crash/restart preserves the root, rotates credentials and denies the old token                                              |
| NP-07 | Component mismatch cannot launch an alternate writer                                                                                     |
| NP-08 | Supervisor IPC loss drains its child writer                                                                                              |

Regressions:84 Node checks,10 joined G-J cases,18 snapshot durability cases and
unchanged matched strict24 passes/6 protective refusals pass. Six earlier native
support checks pass as helper tests. No native manual result is added by these
counts. Source/package versions and all earlier raw evidence are preserved.

## Remaining acceptance

On the actual Mac, setup requests and reads back SQLite fullfsync and
checkpoint_fullfsync in addition to WAL/FULL/exclusive. A setting is not physical
power-loss/VFS instrumentation or automatic proof of an older ADR's stronger
native flush guarantee. Record actual build/OS/filesystem and observed behavior.

The Swift host uses the documented asynchronous WK JavaScript API, but has **not
been typechecked against a Mac SDK here**. The archive download/extraction, dylib
audit, Swift compilation, ad-hoc signing and WK execution are prepared code, not
executed passes. Signing is not notarization/App Store sandbox acceptance. The
fixture has one native window with fixed synthetic A/B grants; production multi-
client context leases/security/host decisions are still open. A Swift test host
does not select Swift or Tauri for production. Rust may own shell/platform services
without duplicating the shared semantic document/task/command implementation.

**Next: the user runs the new Mac builder and reports the actual setup/window
result.** Resolve concrete compile/setup blockers, then guide JN-01 one variation
at a time. Do not ask for another full old manual replay or verdict-click cleanup.
IME unavailable and VoiceOver deferred remain unchanged. JG-12 entity/restore and
JG-13 external-asset closure are the already planned follow-ups, not new research.
No production rebuild, accepted stack/provider or agent commit/push follows here.

Primary sources checked2026-11-14:
[Node checksums](https://nodejs.org/download/release/v24.22.1/SHASUMS256.txt),
[Apple async WK API](<https://developer.apple.com/documentation/webkit/wkwebview/callasyncjavascript(_:arguments:in:in:completionhandler:)>),
[SQLite PRAGMAs](https://www.sqlite.org/pragma.html).

## First actual Mac setup and signing correction17

The user committed16 as60b0505b and ran it on arm64 macOS. Runtime preparation,
Swift compilation and dylib audit completed; the inner runtime signing command
returned successfully. Signing then rejected unsigned Contents/MacOS/clutter-lab.
This is a bundle-layout error, not an editor/domain failure. No headless smoke,
native window or JG-11 result ran in that attempt.

Correction17 moves the shell wrapper to Resources/bin/clutter-lab, adjusts relative
paths and fingerprints the script. Node signs before metadata, then the outer app
signs its main executable and verifies strictly. No signature check is bypassed.
Eight updated Linux helper checks pass; actual Mac signing retry remains pending.
[Evidence](evidence/r08-17-2026-11-14.json). Apple's
[TN2206](https://developer.apple.com/library/archive/technotes/tn2206/_index.html)
recommends Resources for shell/non-Mach-O executables. Existing Swift source,
canonical data and dependency versions are unchanged. Rerun the builder; it creates
a fresh bundle and reuses the verified runtime cache. No old-bundle repair needed.
