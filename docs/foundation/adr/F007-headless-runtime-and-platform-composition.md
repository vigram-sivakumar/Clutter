# ADR-F007: One headless semantic runtime with thin platform clients

Status: **Proposed; headless/native fixture evidence reviewed**, 2026-11-15, revision0.47.
Decisions D-04/D-06/D-10/D-14, PL-01–PL-05 and SEC-01–SEC-04 remain gated.
No production ADR is superseded.

## Context

Actual joined PM/Y and SQLite owner tests now run, including user-reported native
restart/app-closed read and packaged CLI/MCP headless checks. See the [native review](../evidence/r08-native-manual-2026-11-15/review.json)
for exact captured versus user-reported scope. This proves the fixture composition,
not production installed discovery/peer authentication/grants, Tauri or distribution.
The user-reported116.19MiB Node Git blob is not an app RSS/installer measurement.
Current runtime/host/budget blockers are in [readiness](../architecture-readiness.md).

## Proposal

“Space service” names the running Core application service with one Vault adapter.
Historical authority/owner terms refer to that same component, not another core.
[Runtime ownership](../runtime-ownership.md) clarifies UI/CLI/MCP peer calls.


Qualify an on-demand per-Space packaged JS authority running the same TypeScript
semantic core for every interface. One exclusive owner orders commands and
coordinates accepted engine state with persistence. All windows, CLI and MCP are
clients. A locator may discover owners but must own no document state or duplicate
scheduler. No always-running service or cloud backend is required.

Use a bundled pinned runtime; users must not install Node or npm. The owner can be
launched by CLI/MCP with no app window and must not die with its first client.
Native lifecycle, endpoint/peer credentials, store identity/alias containment,
filesystem grants, media staging, clocks and notifications enter through defined
platform ports. Domain code imports no DOM, React, Tauri, AppKit, provider SDK or
OS-specific path API. Rust/platform code implements mechanisms, not a second task,
property, recurrence or restore policy.

Keep the shell replaceable. Tauri2 with Rust platform mechanisms is a candidate,
not selected by the Swift/WKWebView harness. Another shell/runtime, including
Electron, is eligible against the same installed lifetime/security/footprint gates.
Do not preserve a host merely because the existing app uses it or reject another
from unmeasured size/performance assumptions. A Rust native bridge can implement
mechanisms while TypeScript remains the one semantic core; a second Rust policy
engine is not the recommendation. Actual flush/grants/IPC binding needs proof.

One OS/backend ownership proof must exclude resumed stale writers; PID/timeout
heuristics are not election. Resolve path aliases to one store identity, retain
stable operation IDs across owner generations and authenticate destination/grant
before outcome lookup. A discovery failure must never trigger a direct-store writer.
Test bootstrap races and old/current protocol incompatibility before adoption.

## Consequences and alternatives

This keeps PM/Y validation in one runtime and makes CLI/MCP product capabilities.
It introduces an independently versioned packaged executable, lifecycle/IPC,
resource and distribution obligations. Runtime pinning is a shipped dependency,
not a developer convenience. Node's experiment SQLite binding is not yet the
selected production binding. Prove actual native flush/locking and budget behavior.

A Rust core is viable if it proves the same one-owner semantics without divergent
JS/Rust policy/schema implementations; no such complete combination has run.
An embedded JS runtime or another shell is viable if headless lifecycle, available
engine APIs and persistence ports meet the same contract. Do not reject alternatives
using unmeasured size/performance claims or migration effort.

## Acceptance and existing rules

Requires G-J/G-N, PL/SEC ledger gates, dependency-boundary checks and actual
app-closed CLI/MCP launch/grants. Windows implementations may follow, but the
shared module graph and platform interface contracts must be portable at baseline.
No Windows support claim follows from portable TypeScript alone.

Preserve root architecture rules on platform isolation, composition and downward
dependencies. Reconcile concrete Vault/facade ownership and ADR-073's registry vs
document responsibilities in scoped successors; a per-user registry is not a
per-Space document authority. See [review and impact map](../architecture-review.md).

## H01 qualification contract — revision0.56

I1 integration/native evidence is complete within its disposable scope (completion31).
H01 now fixes candidate combinations/gates/recipes/trial targets. Single independent
Node SpaceService first-round control for Tauri/Electron/Swift shells; all package/
process costs counted. Optimized owner/runtime variants need a new candidate and
lifetime/SQL evidence. No shell selected. Next safe host inventory then exact run
manifests. This ADR remains Proposed for production; no existing rule superseded.
