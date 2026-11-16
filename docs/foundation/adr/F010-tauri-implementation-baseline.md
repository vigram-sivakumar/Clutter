# ADR-F010: Tauri implementation baseline and structural freeze

Status: **Accepted for I2 implementation**, 2026-11-16, revision0.70.
Authorized by the user's “then let's freeze this and move to next step”, accepting
Tauri as the provisional desktop choice and explicit selection-gate revision.

## Decision

Use **Tauri2** as the selected desktop implementation host for Mac first and future
Windows. Maintain **one shared web UI/editor** and **one TypeScript Core/API** for
UI, CLI and MCP. Use the existing qualified **ProseMirror/Yjs** editing/context
mechanisms and **SQLite/per-page transactional roots** as the implementation
baseline, behind their existing ports. Rust implements Tauri/native mechanisms,
not another semantic Core. Browser delivery remains a separate platform/backend
adapter against shared UI/contracts; desktop Node/SQLite does not run in a browser.

Baseline these structural contracts now: stable IDs; accepted Space state versus
provisional editor contexts/views; context-owned undo; view-local cursor/navigation;
independent task pages; one guarded mutation/commit path; shared command catalogue;
UI/CLI/MCP peer adapters; revision reconciliation; immutable media/history references;
portable shared modules and explicit OS composition. P01–P39 remain authoritative.
No new feature/UI/schema restriction follows from the limited current prototype.

This decision fixes the implementation direction. Reconsider the host/mechanisms
through a successor ADR only for concrete unmet requirements or measured risks.
Electron is a contingency, not a parallel implementation project. Swift/WK remains
historical comparison evidence, not another shipping feature UI.

## Evidence and tradeoff

Both shortlist hosts pass user-reported basic launch/shared-edit/save/reopen checks.
Builds/signatures/packaged CLI+MCP smoke pass. Experimental arm64 Tauri ZIP is
43668531 bytes/installed logical135516031; Electron158951810/392303256. These are
bounded build measurements, not shipping guarantees or aggregate RAM results.
Tauri fits the shared UI/Windows direction with the smaller measured artifact.

No valid comparative input latency or complete shared-process memory ranking exists.
CLI43 controlled recordings failed finalization/export on both hosts. GUI44 saved
trace is readable;45's supplied output fragment still leaves native input/producer/
frame/clock mapping unvalidated (runloop export blocked, visual-chain empty). No
Tauri defect or performance superiority is established. Risks remain explicit.

## Explicit stage-gate revision

Frozen H01-v1 previously required all applicable mandatory cases/metrics before
host adoption even for the next disposable implementation. The user now authorizes
**implementation adoption before those gates close**, to stop the profiling loop.
[Implementation-entry override46](../runtime-qualification/implementation-entry-override46.json)
is the current scoped policy overlay; original H01/preflight/pins/raw evidence stay
immutable. This is an explicit requirement/scheduling change, not a passing result.

Open/blocked H01 cases become implementation/reliability/measurement backlog at
named milestones. No more host comparison/profiler retries as prerequisite to
normal I2 work. Necessary checks run when the affected capability is implemented.
Unproven latency/memory/scale/security/durability claims remain prohibited. Safety,
access/fencing, final format/recovery and relevant qualification still gate user-
selected durable Spaces; distribution/security/performance acceptance gates shipping.
No gate is removed from its claim: it is no longer a prerequisite for this scoped
implementation host choice. Current I2 still uses marked disposable fixtures only.

## Scope of older records and rules

| Source | Current disposition |
| --- | --- |
| F001/F002 | Structural shared API/accepted-state/context/view ownership adopted above; draft operation details remain feature contracts |
| F003/H01 exit policy | Replaced for I2 host-adoption timing only by this ADR/override46; original tests/targets/results retained |
| F004/F005 and P contracts | Confirmed product/history/task/collection rules retained; future provider/live collaboration remains deferred |
| F006 | PM/Y context/staging mechanism adopted for implementation; final production codec/format/retention/durability details remain open |
| F007 | One headless TS SpaceService and peer clients adopted for implementation; installed identity/admission/fencing/native lifecycle still require closure |
| F008 | Per-page roots/atomic Space transaction direction adopted; initial shipping schema/retention/GC/native data guarantees remain separately specified/tested |
| F009 | Disposable I1 acceptance retained; I2 continues same data-isolation boundary under the selected host |
| Root architecture rules §§1/2/3/5/12/13 | One capability/commit/effective-state owner preserved in new foundation namespace; concrete legacy wiring continues for apps/app |
| Root rules §§4/6/7/8/10/11 | Platform-only OS access, composition/dependency/path/projection invariants retained |
| Root §9 | New modules need actual responsibility; I2 context registry owns leases/lifetime, no forwarding-only package shell |
| Legacy ADR073 | New I2 accepted-state/context/view topology follows this baseline; old apps/app implementation remains governed by its existing rules |

No existing app data path is redirected and no parallel writer is allowed for the
same Space. Existing-user migration/compatibility/cutover is unnecessary (P37).
This scope does not accept every draft detail of F001–F008 or declare shipping
qualification. Root scoped-rule pointer and current handoff reflect this decision.

## Next implementation milestone

[I2 contract](../i2/contract.md): shared context ownership, then move qualified
editor/codec mechanisms into real shared modules once, then selected Tauri composition
and a page/task editing slice through the existing API. No production code imports
qualification experiments. UI changes happen once; native ports stay explicit.
