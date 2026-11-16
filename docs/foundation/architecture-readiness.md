# Architecture decision readiness

Current45 planning disposition: see freeze-readiness-review.md and START-HERE.md.
Structural contracts are ready for baseline review; host/production technology
acceptance and mandatory H01 gates remain provisional/blocked. No ADR status changed.
Manual44 trace is readable; one bounded relationship analysis45 is next.


## Current checkpoint — shared UI and host diagnostics39, 2026-11-16

User38 commit1bcd2783: actual Mac compile and cross-process physical-footprint
counter sanity PASS. All three experimental package size trials pass. Exact sizes,
probe/compiler/SDK hashes and limits are in evidence/host-process-capture-39-2026-11-16/
user-instrument38-result.json. No application footprint or presentation latency yet.

P-38/P-39 now confirmed: one shared web UI/editor, Core and command API; Mac first,
Windows/browser implemented through explicit capabilities/adapters from the start.
No duplicate native UI or split wrappers without demonstrated benefit. Read
shared-platform-contract.md. Swift remains a control; Tauri/Electron are shipping
shortlist. Browser backend connectivity/storage remains future implementation,
not an assumption that Node/SQLite or desktop permissions work inside browsers.

Next apply39, close any qualification windows, reopen H-T with the existing37
launcher --reopen and run instruments39/capture.mjs against completed36. One
candidate first. It captures three provisional process-counter snapshots and tries
one5s native Animation Hitches attach/export after memory sampling.10 new Linux
helper tests pass; actual Mac39 compile/capture/trace still not-run. Processes,
private traces and helper logs stay Git-internal; no endpoint/token/store reads,
app rebuilds or source/native-feature changes. No typing/manual suite requested.

All same-user WebKit matches are explicitly uncertain (may belong to other apps),
missing/changed counters become unavailable/null, no native renderer cost is called
zero. Sums are provisional and may double-count shared pages; they are not rigorous
bounds or ranking evidence. Trace table availability is not input-to-display latency;
trace failure remains blocked. H01 workload/environment/attribution/correlation and
remaining host correctness gates still must close; no host winner. Do not replay
prior manual tests or repeat successful38 calibration for bookkeeping (39 reuses
its native code and sanity check solely to validate the new diagnostic executable).


## Previous checkpoint — native instruments38 (superseded above), 2026-11-16

All three candidates have screenshot-confirmed Ready/two Alpha beta views and
user-reported shared edit/save + close/same-session reopen retention PASS. Expected
retained prefixes: H-T TAURI, H-E ELECTRON, H-S SWIFT. Native JSON reports were not
audited. Reopen does not establish cold owner restart or full H01 acceptance.
See evidence/host-instruments-38-2026-11-16/manual-results.json; raw screenshots
are preserved there. Do not repeat these checks for missing UI verdict clicks.

Next apply38 and run instruments38/prepare.mjs --run completed36 ID (full command
in the instrument guide). It verifies existing signed artifacts/archives, reports
complete installed logical/reported allocated bytes and compressed ZIP sizes, and
compiles a separate native cross-process physical-footprint counter calibration.
A temporary child touches64MiB, is read externally before/held/released, then exits.
No GUI/owner/session/Space/app is launched, rebuilt or modified by this command.

9 new Linux support tests pass; actual Mac instrument compilation/calibration and
sizes remain pending. This is instrumentation preparation, not an H01 benchmark.
Aggregate helper/shared-WebKit attribution and actual native presentation remain
unqualified; no RSS/JS heap/RAF/readiness substitute and no host winner. P-37
no-legacy-user/data-migration scope remains in force. Filename preference: spaces
in quoted downloaded-file paths in Bash. No status-only delivery needed.


## Previous checkpoint — GUI launch37 (superseded above), 2026-11-16

User commit31df10cf/run2026-11-16T10-35-45-751Z-5b4941c3 reports all three
candidates built, signed, strict-verified and packaged CLI/MCP smoke PASS.
Swift/Electron artifacts retained and verified; Tauri now passes too. No host
winner: GUI, installed lifecycle/security and performance remain unqualified.

Launcher37 opens one verified existing signed candidate without rebuilding it.
20 support tests pass on Linux, including actual factory boot/reboot with the
same Space and fresh private bootstrap. These are not Mac GUI or benchmark passes.
Next: apply37, launch H-S from the completed36 run, confirm Ready and Alpha beta
in both views. Do not repeat NC28 tests or launch other candidates yet.
P-37 greenfield scope is included: no legacy-user/data migration work.


Revision0.48 update, 2026-11-15; review23 plus proof24 disposition. This is the current recommendation and readiness
assessment, not accepted production ADRs. Review23 executed no runtime tests; proof24 execution is linked separately,
with exact retained results and limits. Product requirements
remain authoritative in product-behaviour.md. No implementation is retained merely
because it already exists.

## Current scope correction — P-37, 2026-11-16

No existing users/data need migration. [Greenfield scope](greenfield-scope.md)
supersedes old active migration/legacy compatibility/dual-write/cutover blockers.
Initial schema/versioning, backup/recovery, portability and native reliability/
security/performance remain. No new migration harness or preservation of current
format/API required. Frozen build contracts/evidence stay intact; completed build36 remains unchanged. This scope update is included in37.

## Current update — revision0.56, 2026-11-16

[I1 completion](i1/completion-review.md) supersedes older not-run editor/native
statements below within its narrow disposable scope. H01 now defines the bounded
host/runtime comparison: [contract and next inventory](runtime-qualification/README.md).
All H01 measurements unrun; no production winner or full G-Q inferred. Full old
mixed-product scale recipes require schema/features beyond paragraph host fixtures.

## Proof24 update

The [page proof](r08-page-closure.md) now passes PK01–10 headlessly, including per-page
writes and coherent snapshots/pins. No actual EditorViews/new native run, production
format or budget pass follows. Next [I1 entry](implementation-entry.md) / Proposed
F009 clarifies when module implementation starts and what still blocks real data.
Earlier proposed-gate wording below describes review23; execution evidence is separate.

## Recommendation

Use direct **ProseMirror + Yjs**, a **shared TypeScript semantic core**, **one
headless authority per Space**, **SQLite** for atomic commits/history/outcomes,
and **immutable external media files**. Desktop, CLI and MCP are first-class thin
clients of the same operations. Use Yjs now for local editing contexts/selective
history; do not defer the proven local mechanism merely because cloud collaboration
is later. Its presence does not accept live collaboration or provider reconciliation.

Recommend **per-page engine state inside one Space database**, not a database per
page and not a whole-Space Y.Doc saved for every keystroke. A single SQLite
transaction can update several page heads, placements/projections and the original
operation receipt. This candidate now has bounded PK evidence; actual per-page editor binding, final
format and G-Q remain open. Build21/22 remain coarse aggregate controls.
That distinction must remain visible. No new format is accepted by this review.

Keep native mechanisms behind platform ports. Rust is suitable as a proposed
native bridge for file flush/grants/IPC/locking if the chosen host needs it; it
must not become a second task/property/restore engine. The qualified semantic
implementation is JS in the experiment, proposed TypeScript in production. No
complete all-Rust alternative has run. Native host/runtime choice remains open:
Swift/WK results do not choose Tauri, and an Electron alternative has not been
measured. Pinned Node is a proven experiment runtime, not a free production-size
or distribution decision.

## What the evidence actually establishes

| Area | Evidence | Boundary still open |
| --- | --- | --- |
| Local editor/history | Matched strict contract24 passes/6 protective refusals; real view remount and user keyboard checks | Full editor/native matrix, general semantic inverses, broader schemas; protected structural refusal is not universal undo UX |
| Joined editor/durable owner | JG01–10 pass in build15 with real PM/Y views, staged roots, receipts/recovery | Fresh browser rerun after22 is environment-blocked; production protocol/discovery/grants not established |
| Native fixture | User JN01–04 passes; reviewed raw build20 captures JN01/02, runtime, synced PROTECTED root; later restart/CLI from user reports | No distribution/Tauri result, explicit reload-safety trial, IME or VoiceOver pass; broad multi-window behavior still needs its own coverage |
| Canonical tasks | Build21 entity14 cases, six process-death boundaries, single placement/task page, restore conflicts, RPC/CLI/MCP | Coarse aggregate root; per-page historical closure, final schema, task-page restore UX and move undo |
| External media | Build22 media12 cases,13 process-death phases, pinned history retention; same note/task body/cover path | Linux inert-byte/file protocol; native renderer, general codecs/PDF security, Mac full flush/power loss/Windows |
| Shared Store compatibility | Build22 entity14, Node84 and two headless original-profile cases | Those are not fresh browser passes; no representative performance result |

Sources: [history](r07-history-ownership.md), [joined](r08-joined-core.md),
[native review](evidence/r08-native-manual-2026-11-15/review.json),
[entities](r08-entity-closure.md), [media](r08-media-closure.md).
Preserve manual passes; absent verdict clicks or later captures are not failures.

## Important findings from the implementation review

**The aggregate fixture is not the production partition.** Entity/media codec
encode a full Space Y state; common Store stores that full payload per revision.
That proves atomic ownership, but implies write-amplification risk as unrelated
pages/history grow. This is a source-level risk, not a measured benchmark failure.
Per-page payloads must preserve the same task/history/media closure before adoption.

**Deep verification is currently an oracle.** Store.check decodes all retained
roots and, in the media profile, verifies referenced files. This is useful for
crash tests. Ordinary production startup/query cost, checkpoint/index integrity,
lazy reads and explicit deep verification need their own bounded design. Do not
hide the cost by silently weakening corruption/recovery behavior.

**Per-page history requires a coherent version set.** A historical note may refer
to a task whose body and cover later changed while that note's own body did not.
Resolving the current task root would falsify history. Historical reads/pins need
a Space snapshot/commit context and transitive root/asset references, without
copying task bodies into note versions. The same unchanged note payload may appear
in a current view and an old pin with different snapshot contexts: current resolves
the newer task, while the pin resolves its old task. Do not always resolve children
at the note payload's creation commit. Uniqueness applies to active placements in
one version set, not every retained historical row. Avoid indefinite open SQLite transactions
for suspended windows; use explicit immutable version-set leases before any GC.

**Runtime footprint is still a real decision.** The user's rejected-push log
reported a116.19MiB packaged Mac Node executable. That is one uncompressed Git blob,
not installer size, total app footprint or resident memory. No alternative runtime
was measured. Measure packaged cold start, complete process-tree memory and disk
footprint before ratifying the host/runtime. Replacing Node alone does not remove
the PM/Y headless JavaScript runtime requirement without a new qualified binding.

## Proposed single source of truth

| Data | Canonical owner | Permitted derived/provisional form |
| --- | --- | --- |
| Page identity/kind/lifecycle, root head, Space commit ordering | Space database/catalog and commit owner | ID-bound navigation/cache entries |
| Page title/body/properties | One versioned page engine payload; task owns its page data exactly once | PM JSON, UI state, search/property indexes; no independent writable Markdown/JSON body |
| Task placement | One owned task slot in a note; zero slots means independent page/inbox | Rebuildable unique placement index, committed with changed roots; no separate writable owner field |
| Attachment association/cover | Owning page's versioned references/metadata | Rendering/download state; task move does not copy media |
| Media bytes | Immutable hash-named object | Verified file/catalog metadata; no SQL/Y byte mirror |
| Outcomes/history/pins/protected work | Space commit/history/recovery service | Read projections; never layout-only unsaved text |
| Window/pane/tab/editor focus, selection and scroll | That window/view | Persisted layout preferences separate from canonical content |

The exact page/catalog/asset envelopes remain gated by F008 and format qualification.
A derived index can enforce uniqueness at commit but is never a second mutation
API. Rebuild only from canonical roots; ambiguous ownership fails rather than
choosing a winner. Folder/comment/recurrence and other final schemas still need
their existing feature contracts; this table does not silently redefine them.

Tasks remain full pages with covers, body/properties, supported embeds and media.
Opening from a note or All Tasks resolves the same entity. A rendered preview is
a view; the task page itself is not a disposable second copy or projection-only
record. No subtasks, reusable task references, database-style collection property
propagation, template linkage or live cloud collaboration are introduced here.

## Repository/module boundaries to use after qualification

These are logical ownership boundaries, not mandatory one-folder/one-process
wrappers. A module must have a responsibility; avoid forwarding-only packages.

| Proposed location | Owns | Must not import/own |
| --- | --- | --- |
| packages/model | Stable IDs, entity/property primitives and pure invariants | DOM, OS, SQLite, provider SDK |
| packages/contracts | One typed command/query catalogue, DTO/errors/port contracts; validators, CLI help and MCP schemas derived from it | Business reducers or transport/storage implementation |
| packages/document-engine | Headless PM/Y schema/codec/staging/position mechanisms | Window state, filesystem, provider winner policy |
| packages/core | Shared task/template/history/restore/recurrence policies, admission/orchestration and commit planning | DOM/native SDK/OS paths; duplicate per-interface policy |
| packages/persistence | One SQL transaction/history/outcome implementation and immutable asset commit coordination | Independent product reducers or body copies |
| packages/client | Stable-ID requests, retry/outcome lookup, subscriptions/catch-up | Direct SQL/files or global active editor |
| apps/authority | Headless lifecycle/composition, owner election/discovery wiring and serialized commands | Another domain implementation |
| apps/desktop | Views/editor integration, window/pane/tab navigation, focus resolution, accessibility | Direct persistence or a global singleton editor |
| apps/cli and apps/mcp | Parsing/framing/structured output from the same catalogue | Alternate filesystem task/note writers |
| platform/macOS, future platform/Windows | OS grants, locks, authenticated IPC, durability, pickers, lifecycle | Task/property/restore/recurrence semantics |

Allowed imports: contracts → model; document-engine → model/contracts; core →
model/contracts/document-engine. Persistence and client → model/contracts, never UI;
composition roots inject implementations through contracts/ports. Desktop/CLI/MCP consume client/contracts. Shared policy
must not import node:fs/node:sqlite, Tauri/AppKit, React/DOM or a platform SDK.
Deterministic clocks/IDs and file/commit operations enter through ports. The
experiment's convenience imports are not the proposed production dependency graph.
One mutation service orders accepted operations; package count does not create
more writers or processes. Explicit external targets never rely on a focused note.

## Concrete readiness gates

| Gate | Current disposition | Required before crossing it |
| --- | --- | --- |
| Shared mechanism recommendation | Supported by bounded evidence | Keep listed limits and fallback; not blanket acceptance |
| Production page/history partition | Headless PK passed; production format open | Actual editor binding, final format/retention and remaining G-Q; see [page result](r08-page-closure.md) |
| Runtime/host/platform baseline | Not selected | Installed launch/grants/alias fencing, actual native flush contract, reference-host footprint/startup; Tauri not inferred from WK |
| Budgets/scale | Proposed and unmeasured | Fix D11 host/workload/percentiles before representative runs; add Space page-count and active-Space dimensions missing from current recipes |
| Initial native format | Not frozen | Per-page codec/envelope, root/dependency manifests, historical decoders, migration/rollback/export and unknown-content handling |
| Feature implementation | Contract/test planning ready; production feature code gated | Freeze affected product/schema/inverse/acceptance contracts before implementing each vertical slice |
| Shipping | Not ready | Full required feature/native/security/recovery matrix, production binding and distribution validation |
| Providers/live collaboration | Separate future gates | Provider coherence/causal winner/retention tests; never sync live SQLite/WAL or silently replace latest-document policy with CRDT merge |

Existing [budget file](qualification-budgets.json) remains Proposed; no new values
are accepted or benchmark claims invented by this review. IME unavailable and
VoiceOver deferred remain labelled. Windows-ready boundaries are required now;
actual Windows packaging is later, not proven by portable TypeScript alone.

## Implementation entry sequence

1. PK01–10 now pass headlessly. Next is [F009/I1 entry](implementation-entry.md):
   concrete module/catalogue/port contracts and disposable-data enforcement, then
   the shared Core/API slice. No broad engine search or repeated native session.
2. Resolve runtime/native durability, format and D11 blocking evidence alongside
   that scoped architecture review. Publish an accepted successor with precise
   impact/migration boundaries only when its required gates pass.
3. After scoped I1 entry adoption, implement model/contracts/engine/Space-service ports
   and the disposable-data vertical slice. This is not full G-Q or real-vault acceptance. Desktop, CLI and
   MCP join that slice together; do not implement desktop policy then copy it later.
4. Permit real-vault migration only after validated import/export, backup/rollback,
   protected pending work and platform durability/grants. Legacy code stays isolated
   until that explicit transition; no merge of experiments into main as product code.

No speculative feature scaffolding or empty package tree is created by this review.
No production ADR is superseded. F006/F007 remain Proposed, now with reviewed
evidence; [F008](adr/F008-page-roots-and-atomic-version-sets.md) records the next
partition proposal and its current bounded evidence. F009 separately proposes I1
entry. This is a concrete decision package, not a claim that all
qualification or product implementation has finished.
