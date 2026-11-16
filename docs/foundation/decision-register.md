# Decision register

Status: confirmed product scope; mechanism recommendation reviewed2026-11-15.
Technical production baseline/format/host not yet accepted.
Effort and migration scores remain visible with zero decision weight.

## Current execution update — revision0.52

[Native28](i1/native-result.md) is prepared for actual Mac compilation/observation;
77 automated cases/TS/old regressions pass. Browser-safe codec/replica, exact durable
media ingress, same NEW Core CLI/MCP and native close/PDF/report host now exist.
This is a qualification host, not selected shipping shell/runtime or G-Q acceptance.
Next user launch/Ready outcome, then NC28-01 individually. No old manual replay.

## Historical execution update — revision0.51

[Media27](i1/media-result.md) implements shared media API and immutable history/
protected closure.63 runtime tests (19 new), strict TS, legacy media12/page10/entity14/
Node84 pass.11 real crash boundaries; no second publisher/policy/Core owner. F009
scope unchanged; disposable schema3 only, no migration/GC/real-vault writes. Next
native composition must replace Node dev codec assumptions, qualify actual media
presentation and guard/journal pending media requests before close. I1/G-Q remain
open; no full native/browser/security/decoder/performance acceptance.

## Historical execution update — revision0.50

F009 disposable scope continues. [Editor26](i1/editor-result.md):23 new actual-view/
context/protection cases pass in jsdom,44 total runtime tests + strict TS +84 old
Node cases. Core/API owns all mutations; each editor replica is provisional and its
undo context survives view destruction. Peer-bound receipts/protection survive
restart. Raw unknown content is rejected before conversion. No blanket I1 or G-Q
pass: immutable media API, supported browser/native route and production gates
remain open. No change to main/app or confirmed full task-page feature scope.

## Historical execution update — revision0.49

F009 accepted for disposable I1 implementation only, after the user's “proceed”.
[I1a result](i1/result.md):21 integration tests plus strict TypeScript pass for
one catalogue, Core service, SQLite multi-root commit port, CLI/MCP stdio adapters
and desktop draft lifecycle. The old app is not wired in; no real-vault access.
Actual EditorViews/context updates/protection and media API integration remain I1b;
I1/full G-Q are not passed. SQL runtime transactions and MCP framing are factored
once and reused by historical proofs. Production host/runtime/format unchanged.

## Historical execution/entry update — revision0.48

PK01–10 pass in the headless per-page proof24; F008 stays Proposed for production
scope. Task/media semantic planners and one commit engine are shared, not copied.
Next Proposed F009 entry decision: shared Core/API/catalogue/ports and a disposable
three-interface slice; actual page editor contexts/protection must be implemented
and tested there. Native/runtime/format/budget/security/migration gates still block
real-vault writes. “Authority” is the same running Core Space service, not another
owner. User confirms this no-duplication requirement. No blanket architecture or
shipping acceptance and no new manual tests inferred.

## Current technical dispositions — revision0.47

[Recommendation](architecture-review.md) and [readiness/gates](architecture-readiness.md)
are reviewed; no new runtime proof in23. Historical candidate/required-evidence tables
below remain reference, not a claim that joined/entity/media have never run.

| Decision | Current disposition |
| --- | --- |
| D01/D05 | Recommend direct PM/Y now for demonstrated local context history; full schemas/native/inverse matrix still gated |
| D02/D03 | Recommend canonical task pages + shared SQLite commits; per-page format/version-set candidate requires PK01–10 |
| D04/D14 | Shared TS semantic runtime leads; OS mechanisms via ports (Rust eligible), actual shell/production runtime/discovery/grants unselected |
| D06 | CLI/MCP are core peers with shared catalogue/handlers; full production framing/interchange/checkout still gated |
| D07/D09 | Retained roots/pins and immutable external-file publication have bounded proofs; production retention/GC/native flush/media renderer still open |
| D08 | Provider protocol/enablement deferred; latest-document policy unchanged; not a sync-live-DB design |
| D10 | Shared document/context vs local view ownership supported; complete tabs/panes/windows/focus/catch-up release coverage remains |
| D11 | Budget/reference host unapproved/unmeasured; add Space-size/active-Space dimensions before representative runs |
| D12/D13 | Confirmed product directions unchanged; detailed UI/recurrence/inverse schemas/tests required before related feature implementation |

Next [PK contract](page-partition-contract.json) freezes the specific storage/history
partition proof, not another broad editor search. F006/F007/F008 remain Proposed;
G-Q and precise accepted-rule/migration impact must close before baseline acceptance.

## Candidate combinations

| Candidate | Editor/model                                       | Persistence/access                                                 | Main qualification question                                                                     |
| --------- | -------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| A         | CM6 with text-oriented semantic model              | Authoritative files, derived index, shared API                     | Task/page identity, rich views, keyboard and safe provider state/history reconciliation         |
| B         | Tiptap/PM with Clutter semantic schema             | Structured native files, derived index, CLI/MCP                    | Coordinated operations/moves, native input and retained version closure                         |
| C         | Tiptap/PM with Clutter semantic schema             | Local transactional SQLite, immutable assets, CLI/MCP and checkout | Native input, process authority, rich/history integrity and separate provider protocol          |
| D         | Structured editor with operation/CRDT-native model | Local operation/checkpoint store, derived queries, CLI/MCP         | Whether present reliability/semantics justify it without requiring live collaboration initially |

C was a leading research proposal, not a ratified choice. D may also use SQLite.
A synced database file is not a candidate safe transport. Alternative engines
remain eligible; no candidate wins due to existing investment or implementation ease.

## Open technical decisions

| ID   | Decision                                                                                 | Required evidence / gate                                                                                                                                            |
| ---- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-01 | Editor/extension composition and DOM ownership                                           | Shared reliability plus declared source/structured profile UX; actual native keyboard/IME/accessibility (T-01; EI catalogue, Q-01–Q-09)                             |
| D-02 | Canonical schema, tasks/placement, history closure and migration (R03 conditional draft) | Page/task identity, move/copy/restore, unknown-content handling (T-09, T-14, T-17, T-18)                                                                            |
| D-03 | Persistence, indexing and transaction scope                                              | Failure injection, rebuild and any FTS discrepancy reproduced/resolved if applicable (T-06, T-10)                                                                   |
| D-04 | Headless authority, language/IPC, ownership election and takeover                        | Concurrent processes, sandbox access, app-closed API use (T-04, T-07)                                                                                               |
| D-05 | Local multi-view undo and remote snapshot boundary                                       | Context-selective undo, dirty-state/IME protection, safe history rebase/reset (T-02, T-03, T-12)                                                                    |
| D-06 | External AI, native/Markdown interchange                                                 | CLI/MCP parity, loss reports and stale checkout handling (T-04, T-09)                                                                                               |
| D-07 | Retention, pins, restore and cleanup budgets                                             | History reconstruction, overwrite preservation, comments and assets (T-11, T-20)                                                                                    |
| D-08 | Optional provider protocol and deterministic winner order                                | iCloud/Drive feasibility, durable outbox/catch-up, transfer acknowledgements, tombstones, ancestry, clock skew and disable/restart/background-lifetime (T-12, T-13) |
| D-09 | Media lifecycle and future backup boundary                                               | Images/PDFs, interrupted publication, complete native export/snapshot and reachable roots (T-06, T-10, T-11)                                                        |
| D-10 | View/context lifetime and duplicate-open policy                                          | Windows/tabs/panes, focus, missing destinations (T-02, T-08)                                                                                                        |
| D-11 | Performance budgets/scale envelope                                                       | Agree document/media/history sizes and percentiles before benchmarking (T-15)                                                                                       |
| D-12 | Inventory, predefined fields and UI detail                                               | Keep/redesign/retire inventory; editor/collection/default-field semantics (T-01, T-16, T-17)                                                                        |
| D-13 | Task scheduler, recurrence and sync consistency                                          | Next-slot/time-zone rules, series identity, duplicate completion, archive/reminder behaviour (T-18, T-19)                                                           |
| D-14 | Cross-platform dependency/repository boundaries                                          | Shared code free of macOS dependencies; explicit adapters and path contracts (T-21)                                                                                 |

Future, non-initial gates: F-01 live cloud collaboration and page-sharing roles;
F-02 automatic backup feature; encrypted Spaces need a new scope decision rather
than an assumed commitment. See T-22/T-23 for future acceptance. Initial comment
release timing is still open; anchors/history cannot be improvised if deferred.

## Resolved product directions

Do not reopen these as unanswered technology questions: predefined-field collections;
independent typed properties; task pages/inbox/single location; no subtask semantics;
cut moves/copy duplicates; task/owner deletion; archive/reminder behaviour; recurrence
with empty-body next occurrence; unlinked template copies; convert-to-page links;
read-only page embeds; fixed dates/relative labels; separate reminders; version pins;
latest-document-wins with history; opt-in provider sync desired; macOS first and
Windows-ready; images/PDFs now. Details live in product-behaviour.md, not duplicated
property definitions or independently editable task projections.

## Evidence discipline and approval

Record runtime/package versions, fixture, exact input, expected/actual result,
traces and limitations. Earlier PM patch/FTS findings are reproduction leads, not
freshly verified evidence. Linux WebKit is not macOS/WKWebView. Candidate-specific
patches need maintenance assessment and controls.

Score UX, correctness, architectural coherence, extensibility, maintainability,
external-tool usability, portability and recovery. Blocking failures cannot be
averaged away. Keep effort/migration estimates outside the decision total.

Decisions move Proposed → Qualified → Accepted or Rejected, with evidence/date/
reviewer and affected prior rules. Confirmed product scope does not prove a
technology passes it. No target technology has completed these gates in this pack.

## Historical R01–R06 checkpoint

R01 is complete as a bounded [capability inventory](current-capability-inventory.md).
Its selected files passed 1,003 assertions across initial and targeted reruns;
initial dependency-load errors/setup corrections remain recorded. No full-suite/
clean-install or native/provider qualification is claimed. R02 now has a reviewable [interaction specification](editor-interaction-spec.md)
and [72 seed cases](editor-interaction-cases.json), not runtime results. Q-01–Q-09
track proposed model-specific policies; no engine or Markdown-equivalent behaviour
is implicitly accepted. R03 now has conditional [model](document-model-spec.md), [API](command-api-spec.md)
and [signature/scenario](model-api-contract-cases.json) drafts. DM-01–DM-15 name
invariants; M-01–M-07 and Q-01–Q-09 remain unapproved policy/encoding gaps. No new
runtime/domain/protocol tests were run. R04 now has conditional [persistence contracts](vault-persistence-spec.md) and
[30 unexecuted fault scenarios](persistence-contract-cases.json), comparing P-SQL/
P-ROOT/P-TEXT. PS-01–PS-07 remain open; no crash/backend/native proof is claimed.
R05 provider protocol/feasibility and R06 qualification preparation are now drafted;
R07 native and broader semantic qualification is next, preserving M/Q/PS/SY/PL/SEC gaps. [START-HERE](START-HERE.md)
records handoff/authorization and [roadmap](roadmap.md) orders specifications,
qualification and implementation. These navigation documents do not accept any
technical decision or duplicate product rules.

## R05 provider qualification boundary

[R05 protocol](provider-sync-spec.md) owns SY-01–SY-08 rather than duplicating
provider decisions here. D-08 remains unaccepted while causal ordering and coherent
task ownership are unqualified; [feasibility](provider-feasibility.md) is research only.

## R06 qualification preparation

[Editor qualification](editor-qualification-plan.md) tightens D-01/D-05 gates;
[platform](platform-boundaries-spec.md) owns PL-01–PL-05 and [security](local-security-api-spec.md)
owns SEC-01–SEC-04. [Budgets](qualification-budgets.json) are D-11 proposals, not
measurements. R07 evidence now covers only the scoped first slice; no technology
was accepted or fully qualified.

## R07 first-slice evidence

[R07 findings](experiments/r07-two-view/findings.md) supply concrete D-01/D-05
blockers. No engine/library/backend was selected. The guarded history experiment
is not a production workaround approval; compare viable complete candidates and
native evidence before accepting D-01/D-05.

## R07 second-slice comparison

[Second findings](experiments/r07-two-view/follow-up-findings.md) narrow D-01/D-05
with tested alternatives, not an accepted stack. D-04/D-03 parity, structural history,
performance and actual native input remain gates. Preserve declared candidate scope
and costs; no sunk-cost preference or provider-policy change.

## R07 matched live-authority/history evidence

[Matched results](r07-matched-comparison.md) execute synthetic shared read/insert/
outcome operations from desktop, CLI and stdio MCP against each live authority.
The relay is test infrastructure, not production IPC/persistence. Three strict
history gates remain open; D-01/D-03/D-04/D-05 and the target 51 operation sketches
are not accepted by these scoped passes. No existing manual result is revoked.

## R07 context history qualification update

[Build12 evidence](r07-history-ownership.md) closes the three demonstrated history
boundaries under the unchanged matched contract. Context lifetime owns history;
views do not dispose it. Six explicit unsafe-inverse refusals remain classified
separately from 24 applied/passed cases. The live synthetic app/CLI/MCP slice is
still ephemeral; durable owner/outcome/restart qualification is next. No D-01/
D-03/D-04/D-05 stack or target 51-operation API acceptance follows from this alone.

## R08 review recommendation, revision0.38

The [review](architecture-review.md) recommends the C-origin combination for the
next proof: direct PM/Y origin-aware contexts, one headless TS Space authority and
SQLite. This is a proposal combining separately tested boundaries, not a Qualified
or Accepted complete stack. Tiptap/native shell/production runtime binding remain
unselected. Proposed [F006](adr/F006-structured-origin-and-transactional-roots.md)
and [F007](adr/F007-headless-runtime-and-platform-composition.md) record consequences
and old-rule impact; A/B/C-step/D and alternative hosts remain explicit reserves.
[Gap disposition](architecture-gap-disposition.md) maps every Q/M/PS/SY/PL/SEC label;
none is silently marked resolved. Next G-J runs JG-01–10 with actual editor views
and the real durable owner. All13 [JG cases](joined-core-contract.json) remain
not-run. No new runtime tests, production rule supersession or provider enablement.

## Joined follow-up, revision0.39

[Joined proof15](r08-joined-core.md) now passes JG-01–10 on Linux with real editor
views and an independent SQL owner, plus retained regressions. G-J is boundedly
qualified; no full stack accepted. Next JG-11 native/installed-headless candidate;
JG-12/13 model/external-asset and other G-Q gates remain. Frozen JG specification
not-run fields record its original state; execution evidence is separate.

## Current qualification update — revision0.45

JG01–10 executed in15; native JN01–04 passed by user report in20, with raw report
review recording exact captured limits. [Entity proof21](r08-entity-closure.md)
passes14 bounded cases for proposed canonical tasks/unique placement and atomic
multi-note roots. Conservative note restore refuses ownership changes and does
not rewind independent task bodies. Coarse aggregate root, partitioning, task-page
restore UX, native entity binding and cross-note undo remain unaccepted. F006/F007
stay Proposed. Next JG13 external PNG/PDF/history closure, then remaining G-Q gates;
no silent production supersession or full JG11/distribution approval.

## External media evidence — revision0.46

[Media proof22](r08-media-closure.md) supplies12 bounded JG13/PS02/PS04 cases with13
real process-death boundaries: publication-before-reference, original receipt,
pin/history retention and safe orphan treatment. Notes and tasks share page-ID
body/cover associations. This is Linux inert-byte/storage evidence, not native
renderer, Mac full-flush/power-loss, general PDF security, production partitioning
or full release acceptance. Shared Store regression evidence: entity14, Node84
and2 headless original-model cases; fresh browser suites environment-blocked.
Next reconcile the gate ledger and Proposed ADRs in a decision-readiness review;
no automatic baseline acceptance or repeated manual session.
