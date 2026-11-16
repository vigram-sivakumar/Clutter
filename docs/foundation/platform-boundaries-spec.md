# Platform and headless authority — R06

Revision 0.9, 2026-11-14. Conditional architecture proposal, not an implemented
process model. D-04/D-14 and PL-01–PL-05 require experiment evidence. Existing
production rules remain binding until an accepted ADR identifies replacements.

Runtime naming update0.48: the [Space service](runtime-ownership.md) is the running
Core application service, not an additional policy implementation. UI/CLI/MCP are
peers over its API. Current [page proof](r08-page-closure.md) and [I1 entry](implementation-entry.md)
separate bounded evidence from production platform acceptance.

## Current qualification route — revision0.56

[H01](runtime-qualification/contract.json) fixes the host/runtime comparison while
preserving these ownership/platform requirements. It does not infer that framework
sidecar APIs satisfy independent owner lifetime or that a system webview eliminates
headless runtime costs. First gather actual Mac host inventory; no measurement or
shipping choice has run. I1 fixture evidence is not production IPC/auth/alias proof.

## Selection principles

The user explicitly permits replacing 100% of the current implementation.
No editor, language, framework, storage layout or existing module is mandatory.
Select the best coherent architecture for confirmed product behaviour. Existing
code is optional regression evidence; migration/effort have zero decision weight.
Logical responsibilities below are boundaries, not one service/process per box.

## Dependency and ownership contract

| Boundary            | Owns                                                                                       | Dependencies permitted                                       |
| ------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| Semantic core       | Entity invariants, commands, inverses, identity, scheduler and reconciliation policy       | Pure types, deterministic clock/ID inputs and defined ports  |
| Local authority     | Session ordering, authenticated admission, outcomes, subscriptions, recovery orchestration | Core and persistence/platform ports                          |
| Persistence/history | Commit, durable outcome/outbox, protected roots and reconstruction                         | Backend/OS durability adapters; R04 rules                    |
| Editor integration  | Provisional input, intent mapping, position mapping and context history integration        | Shared API/session protocol, editor engine and view-local UI |
| Desktop shell       | Windows, menus, focus, pickers and application settings                                    | Shared API and platform capabilities                         |
| CLI/MCP             | Parsing/framing, explicit targets, structured results and error mapping                    | Same shared API client; no UI or direct store writes         |
| Provider transport  | Transfer, discovery and credential mechanics                                               | Platform ports and core publication/ingestion surface        |

Shared core imports no DOM, React, Tauri, AppKit, macOS bookmark, provider SDK or
window singleton. No shell/CLI/MCP adapter embeds a second task/edit policy.
Composition roots choose implementations. Represent missing capabilities as typed
results; do not hide errors with platform conditionals spread through the domain.

## Proposed host topology and startup

Compare an on-demand per-user broker owning per-Space coordinators with an on-demand
per-Space host. Both must work with every desktop window closed; neither requires
an always-running daemon. Do not select Rust versus TypeScript from current code.
No multi-device authority or cloud server is implied.

1. Resolve a registered Space ID to a local store identity through trusted registry
   access. A display path/PID is not the Space identity or ownership proof.
2. Inspect a protected endpoint descriptor and authenticate the peer. If absent,
   contenders attempt OS-backed exclusive store ownership through one defined port.
3. Only the lock holder performs recovery and publishes an endpoint with a fresh
   authority generation. Losing launchers attach/retry with bounded deadlines.
4. Negotiate protocol/schema/capabilities, bind the client grant and context, then
   admit commands. Incompatible clients fail without trying a direct-store fallback.
5. Hold exclusive ownership until all accepted effects are durable/protected and
   the host has relinquished store access. Publish shutdown state before withdrawal.

Do not take over because a heartbeat expired or a PID vanished. A suspended owner
may resume. Prove it cannot write before exposing a new writer; if an OS lock cannot
provide the required storage guarantee, qualify a backend-enforced fencing design.
Leases/timeouts alone are insufficient. Reject foreign network-filesystem/store
locations unless ownership/durability is actually qualified there. Never make an
active SQLite/WAL provider folder the multi-device coordination mechanism.

## Command/session protocol

Authority generation, accepted revision and durable revision are distinct tokens.
Every response/event names the relevant generation and revision. On reconnect,
check durable outcome identities before retrying with the same semantic operation.
Reusing an operation ID with a changed request is rejected. Authorization precedes
receipt lookup; R03 deduplication precedes stale revision rejection.

Views hold an accepted snapshot plus necessary provisional editor state, not a
second independent persisted document. For responsive typing, compare bounded
optimistic local input with authority round trips. Each provisional edit records its
base, origin/group and position mapping. A refusal/rebase must protect the original
input and map the selection or expose recovery. Rejecting stale text is not permission
to lose typed characters. Prevent transport echoes from reapplying local input.

The engine may own the mechanics of local history only if core inverses and other
contexts remain coherent. Ordinary full-state replacement after every keystroke is
not an acceptable integration shortcut. Prove same-range local interleavings as well
as disjoint edits; unsafe undo refuses visibly without deleting another origin.

Subscriptions carry sequence/revision hints, not the only copy of truth. Detect gaps,
resubscribe to a coherent snapshot/checkpoint, map or protect pending input, and cancel
obsolete responses by generation. Hidden views reconcile on resume. Bounded queues
may collapse notifications to resync-required, never silently drop domain commands.

## Lifetime and shutdown

| Trigger                    | Required result                                                                                                            |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Last view closes           | Detach view only after work is durable or recoverably protected; document lifetime follows outstanding work, not tab count |
| CLI finishes               | Ordinary mutation waits for local durability by default; pending/uncertain returns OutcomeRef; no cloud dependency         |
| MCP client disconnects     | Stop that session/subscriptions; cancellation cannot undo an already committed command                                     |
| Idle host exits            | No unprotected provisional input/accepted effects; outbox survives; idle timer proposal is in qualification budgets        |
| App quits while save fails | Protect work or cancel quit; destructive discard remains Q-08, never inferred from a generic close request                 |
| Host crashes/restarts      | New generation after exclusive takeover/recovery; clients query outcomes and catch up before accepting stale results       |
| All capable processes stop | Clutter-controlled ingestion waits; OS transfer of staged files is separate                                                |

`sync once` is a proposed scoped workflow, not a new domain-operation implementation:
report local outbox publication and discovery/ingestion frontier at this binding,
including pending media, access loss and deadline. It cannot promise all-device
agreement. An uncertain upload deadline leaves durable retry work. CLI/MCP capability
exposure and exact wire/exit mappings remain PL-03/SEC-04; R03's 51-operation logical
registry is unchanged by this workflow description.

## Platform ports and Windows seam

| Port                    | Contract to qualify on each supported OS                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| Store ownership         | Exclusive owner, identity aliases, contention, suspend/resume and safe release/takeover     |
| Local IPC               | Private endpoint discovery, peer/grant verification, bounded framing and cancellation       |
| Durable filesystem      | Flush/replace/rename/locking semantics, symlink-safe root containment and media staging     |
| User grants/credentials | Picker grants, expiry/revocation, secure token handling and accessible reauthorization      |
| Native editing shell    | Actual key/menu routing, clipboard types, IME, accessibility and view focus                 |
| Provider facilities     | Exact route, placeholders, coordination and scoped transfer evidence                        |
| Layout/notifications    | View-local persistence and OS delivery; no ownership of document bodies or scheduling rules |

Test case-sensitive and insensitive paths, Unicode normalization, reserved names,
long names, separators, aliases, read-only volumes and missing assets. Portable IDs
never embed absolute paths/bookmarks. Do not assume two identical-looking paths are
the same store or that copying a Space is a new replica without explicit identity
policy. Windows packaging/native evidence may be deferred; shared-module boundaries
and path fixtures are initial requirements. macOS qualification proves only macOS.

## Open implementation choices

| ID    | Proposal / unresolved choice                                                          | Gate                                                                 |
| ----- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| PL-01 | Per-user broker versus per-Space host, language/runtime and installed launch location | R07 contention, headless, startup/performance and sandbox experiment |
| PL-02 | OS lock/identity/peer credentials and any backend fencing                             | No simultaneous writers; suspend/takeover and path-alias proof       |
| PL-03 | Protocol codec/versioning, sync-once/status CLI/MCP mapping                           | SEC-04 and exact candidate manifest before adapter acceptance        |
| PL-04 | Provisional edit reconciliation, context-history mapping and reconnect retention      | Native editor gates, Q-05/Q-07 and D-05                              |
| PL-05 | macOS distribution/sandbox model, Windows adapter surface                             | Native packaging/grant proof; no blanket portability claim           |

See [local security](local-security-api-spec.md), [editor qualification](editor-qualification-plan.md)
and [qualification budgets](qualification-budgets.json). No host topology is accepted.
