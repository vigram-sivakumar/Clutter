# I2c disposable desktop composition — delivery48

This completes the pending development composition source, **not a rebuild of the
existing Clutter product**. apps/app remains CM6/Markdown and unchanged. The user
wants existing UI/components reused while old architecture can be stripped entirely;
a cleanup/replacement plan must be discussed before that product work starts.
See [proposal](rebuild-plan-proposal.md).

## Boundaries and current source

| Location | Responsibility |
| --- | --- |
| apps/foundation-desktop | Disposable development host, Node transport/bootstrap/packaging and Tauri-only window bridge |
| packages/foundation-ui | Shared view/context workspace controller; no Node/Tauri or direct storage |
| packages/foundation-runtime | Existing Core/editor/SQLite/CLI/MCP mechanisms; one semantic operation path |
| generated Git metadata | Native project copies, dependency tools/locks, Node cache, bundles, private session/config/report locators |

The minimal two-view screen is integration UI only. It establishes no new product
visual direction and is not the UI we will maintain alongside existing Clutter.
The shared controller uses leases over existing EditorSession, toolbar focus and
context history; opaque relative-Y selection bookmarks survive asynchronous remount
and foreign edits. They remain view-local, never serialized as content/recovery.

## Owner and close lifecycle

Each private marked temp session has one fixed loopback reservation. The server
binds before opening SQLite; parallel startup losers cannot create another Core.
An occupied or unresponsive address fails closed: no PID/timeout takeover, unlink,
alternate endpoint or substitute Space. Graceful stop drains accepted requests,
closes Vault, then releases listener. Full installed alias/copy/OS fencing remains
unqualified; this is a constrained development mechanism, not global discovery.

UI uses CoreClient directly; CLI/MCP are peer stdio adapters, not UI business
subprocesses. All attach to the same service. Owner requires its bundled pinned
Node and stays alive after native window exit. Explicit stop/restart preserves the
accepted page in tests; idle shutdown policy remains an open lifecycle milestone.
No per-Space user-facing access codes are introduced by private developer tokens.

Window close freezes interaction and delegates existing save/protection handling.
Failure keeps views/focus/context and refuses close. The Rust bridge accepts only
matching close nonces and one initial loopback navigation; raw reload is disabled
in this bounded build. Safe reload, installed grants and release failure matrices
are still open. This is not protection against arbitrary renderer/process/power loss.
No new media UI is wired yet; existing Core media/history/recovery obligations remain.

## Runner and reproducibility

Root commands: foundation:desktop, foundation:desktop:reopen, foundation:desktop:check.
The bootstrap runs before typed Core imports on the user's current Node, verifies
and acquires pinned24.22.1, then runs build/owner with pinned/bundled Node. No global
Node/Rust install/change. macOS ARM64 first; shared UI/Core are platform-separated,
Windows native runner/runtime still not implemented or claimed.

First build currently reuses exact dependency locks from the user's completed
2026-11-16T10-35-45-751Z-5b4941c3 build, verifies report/hash/direct pins, changes only
root package names, and builds Cargo locked/offline with the prior Rust1.90.0.
Prior source/binaries/data stay untouched. Native lock derivatives/provenance are
saved in the new Git-internal build. **Capture these real locks into the agreed
product tooling before a fresh checkout becomes independently buildable.** A missing
prior seed fails explicitly; the runner does not resolve an unlocked graph.

All outputs stay under git rev-parse --git-path clutter-foundation48. Normal reopen
retains the same session/bundle; another live/possibly reused UI PID refuses a second
window. Explicit --new preserves prior locators in history and creates a distinct
synthetic Space; it never silently substitutes fresh data for failed recovery.
Native signing is ad-hoc development only, with bundled Node signed before content
manifest and outer strict verification. Generated ATS policy permits local networking
and removes broad generated exceptions. Not installed/notarized distribution approval.

## Validation and next action

102 runtime tests pass on Linux, strict TS and root lock dry-run pass. Nine new
cases cover shared graphs, concurrent single owner, bundled Node, CLI/MCP/UI parity,
restart, occupied address, admission/frame refusal, actual browser remount/history/
failed-close, relative selection mapping, runtime/native-lock/ATS guards. jsdom geometry
is stubbed for command flow, no native keyboard/caret geometry claim. Failed attempts
are retained. A late I1 status callback after DOM teardown was made a no-op rather
than accessing a destroyed document; no persistence/ack semantics changed.

**Mac compile/signature/window behavior has not run here.** After applying48 and
normal root npm ci --ignore-scripts, run npm run foundation:desktop. First report only
whether the app reaches Saved with both editor views. Then perform a small changed-
route check, not the old manual or profiling suites. No memory/latency winner inferred.

After bounded composition closeout, discuss the [clean rebuild proposal](rebuild-plan-proposal.md).
Do not automatically continue product feature implementation or replace/delete the
existing pipeline before that discussion. F010/override46 remain unchanged.
