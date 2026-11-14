# ADR-F007: One headless semantic runtime with thin platform clients

Status: **Proposed for qualification**, 2026-11-14, revision 0.38.
Decisions D-04/D-06/D-10/D-14, PL-01–PL-05 and SEC-01–SEC-04 remain gated.
No production ADR is superseded.

## Context

The direct PM/Y candidates execute headless semantic operations in JavaScript.
Build13's real owner demonstrates browser/CLI/MCP access to one durable SQL writer,
but a parent test launcher supplies credentials. It does not implement installed
endpoint discovery, app-closed bootstrap, OS peer authentication or production grants.

## Proposal

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

Tauri2/WKWebView plus this packaged owner is the leading host experiment because
it exercises the native webview route already represented in the lab while
retaining the single headless engine/runtime boundary. This is a test hypothesis,
not a conclusion from current-app compatibility or measured resource savings.
The Swift harness is not a Tauri acceptance result. Qualify signing, update/runtime
compatibility, sandbox/grant model and app-closed independent launch. If unsuitable,
compare another shell/runtime topology, including Electron, using the same gates.

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
