# Architecture decision review — R08

Revision 0.38, 2026-11-14. **Proposed recommendation, not an accepted baseline.**
The user confirms patch13 applied. This review uses retained evidence; it executes
no new runtime tests and changes no production rules. Product contracts remain in
[product behaviour](product-behaviour.md); this document owns the current comparison,
recommendation and approval gates, not a second requirements specification.

## Recommendation

Advance **ProseMirror + origin-aware Yjs editing contexts + one headless TypeScript
Space authority + local SQLite** into the joined qualification slice. Keep the
editor wrapper optional: the executed candidate is direct PM, not an evaluated
Tiptap extension composition. Use thin desktop, CLI and MCP clients from day one.
Prefer an on-demand per-Space owner for the next proof; desktop closure must not
prevent CLI/MCP use. No server or hosted database is needed for this local topology.

This combines candidate C's transactional storage with candidate D's origin-aware
local editing mechanics. It is a new **proposed combination**, not a claim that
build13 already persists the Origin engine. It earns the next experiment through
observed behavior and coherent ownership, not existing-code compatibility or effort.

| Boundary                  | Proposed choice                                                                                                         | Evidence and qualification limit                                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Editor                    | Direct ProseMirror with Clutter-owned schema, keymaps and table interactions                                            | Native09/manual evidence and matched browser tests; not full EI/native matrix or production schema                           |
| Local shared text/history | Origin-aware Yjs; context-owned UndoManager, view-local selection                                                       | Origin13 pass/2 protective refusals versus step11/4 in the matched fixture; no weighted score or universal correctness claim |
| Domain/authority          | Headless TypeScript, serialized Space commands, one process owns accepted state and commit coordination                 | Headless PM/Y operations exist; live API and durable process proofs are separate; joined boundary not run                    |
| Persistence               | SQLite transactions for accepted roots/revisions/outcomes; immutable external assets with explicit publication ordering | 18 bounded P-SQL cases pass for PM snapshots and in-DB bytes; Y encoding/external files/native durability unqualified        |
| Native host               | Host-neutral shell port; Tauri2/WKWebView plus packaged JS owner is the leading packaging experiment                    | Existing Swift/WKWebView lab is not a Tauri/sidecar proof. Runtime, distribution and host are not selected                   |
| CLI and MCP               | First-class adapters over the same authenticated owner operations                                                       | Real subprocess parity/retry evidence; production discovery, grants and full API coverage remain gates                       |
| Interchange               | Markdown is an import/export/guarded checkout projection                                                                | Structured native state is proposed; exact loss reporting and checkout reconciliation still require proof                    |
| Provider sync             | Disabled until its own protocol gates pass; transfer coherent immutable packages                                        | No live SQLite/CRDT-update-folder sync; latest-document policy stays as confirmed                                            |

### Why this engine leads, and what can reverse it

[Build12](r07-history-ownership.md) demonstrates context-owned history through real
view destruction and preserves unrelated foreign edits. The Origin fixture has
fewer protective refusals in the unchanged matched contract. That is useful local
undo evidence; future multi-person editing is not the justification for requiring
Yjs now. CRDT presence alone does not establish safe selective undo, permissions,
identity, task moves, document-level winner reconciliation or durability.

The cost is a versioned binary engine codec, identity/GC/retention constraints,
context lifetime integration and conservative structural undo inside a changed
table. The retained raw Origin control fails structural safety; the guarded
candidate must be used. If the joined proof cannot preserve safe edits/history,
validate staged updates or meet agreed resource budgets, reconsider the step
candidate or another engine. Do not silently substitute blanket undo refusal for
required safe inverses. A passing bounded contract is not an accepted final undo UX.

## Complete alternatives

| Combination                                                                             | Disposition for the next experiment | Reason / missing evidence                                                                                                                                                        |
| --------------------------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A: CM6/text authority + files/index + shared API                                        | Reserve, not disproven              | Current-source familiarity has zero weight; target task pages, structural editing, native UX and cross-file atomic closure need their own full proof                             |
| B: PM/semantic model + native immutable files/index (P-ROOT)                            | Reserve, not disproven              | Coherent multi-entity root publication/receipt/history/asset ordering is not executed; no evidence it is slower or less safe than SQL                                            |
| C-step: PM step/history contexts + SQLite                                               | Active fallback                     | Same matched contract passes with11 applied/4 refusals; mapped provenance/opaque-step guard and rebase complexity remain; no joined persistence proof                            |
| C-origin: PM/Y contexts + SQLite + headless TS owner                                    | Recommended for qualification       | Strongest current bounded local history evidence plus SQL atomicity proof; their combination and full semantic schema remain unqualified                                         |
| D-operation store: operation/CRDT-native log + checkpoints and derived index            | Reserve                             | No executed operation-store retention/migration/GC/root proof; do not mistake SQLite's physical WAL for a semantic operation history                                             |
| Rust domain owner + JS editor replica                                                   | Reserve pending concrete boundary   | Not rejected by language preference. Would need one schema/command policy and proven cross-runtime engine semantics; do not port the same business rules independently into Rust |
| Electron or a different native shell + same shared owner                                | Host fallback, not benchmarked      | Remains eligible if packaging/native input/budget gates reject the lead host; no unmeasured size/performance claim                                                               |
| Direct CLI/MCP file/SQL writes, per-window independent writers, live provider-folder DB | Reject as target design             | Bypass the confirmed shared mutation/identity/owner contracts                                                                                                                    |

No numerical score is assigned to unmeasured dimensions. Correctness blockers
cannot be averaged away. Performance targets are [proposed budgets](qualification-budgets.json),
not measured results. Migration/implementation effort has zero selection weight.

## One source of truth, including the engine codec

[ADR-F006](adr/F006-structured-origin-and-transactional-roots.md) proposes one
versioned accepted Y-state payload per synthetic document for the joined proof,
committed with its SQL revision/outcome. PM JSON is decoded validation/rendering
state; do not independently save it as a competing writable root. Read projections
must rebuild from the committed Y bytes after a true owner restart. This changes
build13's experimental PM-snapshot envelope and therefore needs new evidence.

Y IDs are engine coordinates, not Clutter document/block/task identities. The
production entity layout still needs M-06 qualification: document, task body/title/
properties and placement each have one canonical owner; a task page or All Tasks
is a projection, never a second body/placement. Build13's embedded synthetic task
is not a production task-store decision. A proposed SQL metadata/Y payload boundary
must prove one atomic cross-document move and history restore without duplicate
ownership before the entity model is accepted. Do not add independently writable
SQL body rows, PM JSON, Markdown or index records to solve a missing operation.

An in-memory live engine and its committed serialization have different lifetime
roles. Pending view edits and recovery records are explicitly provisional. Version
roots are immutable historical states. Derived search/property projections may be
rebuilt; losing canonical content, receipts, task placements or pinned asset roots
cannot be treated as an index miss.

## Runtime and repository boundaries

[ADR-F007](adr/F007-headless-runtime-and-platform-composition.md) proposes one TS
semantic implementation in an independently launchable, packaged JS owner. The
shell supplies platform capabilities; it must not reimplement task/schema rules.
CLI/MCP must find or launch the same owner without opening the app UI or relying
on a globally installed developer Node. One small per-user locator can discover
per-Space owners but owns no document state. Owner shutdown must not depend on the
first requesting client staying alive. Protect and bound idle shutdown separately.

Proposed package responsibilities, not directories to create now:

| Module                                   | Owns                                                                                | Forbidden dependency or duplicate                                       |
| ---------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| domain                                   | IDs, semantic invariants/commands, typed properties, lifecycle/scheduler policies   | DOM, shell/provider SDK, filesystem; second editor-specific task policy |
| document-engine                          | PM/Y schema translation, validation, positions and context history                  | Desktop window lifecycle or provider winner policy                      |
| authority                                | Admission, serialized operations, sessions, outcomes, recovery and subscriptions    | Per-interface reducers or independent window state saves                |
| persistence                              | SQL transaction/roots/codec versions and asset commit port                          | Product rules or a second content model                                 |
| api-contract/client                      | Versioned schema/error/outcome types and generated thin clients                     | Storage/DOM implementations                                             |
| desktop/editor                           | Intent input, provisional replicas, view-local selection; windows/panes/tabs/layout | Direct database/native-file mutation                                    |
| cli / mcp                                | Parsing/framing, explicit targets and structured responses                          | Alternate business logic, raw filesystem/SQL writes                     |
| platform-macos / future platform-windows | Locks, private IPC, grants, native lifecycle and asset I/O                          | Semantic task or document policies                                      |
| provider adapters                        | Transfer/discovery/credentials behind qualified ingestion/publication ports         | Direct current-root mutation or implicit live CRDT merge                |

A package earns its existence through ownership/dependency boundaries; it need not
be a separate process or forwarding layer. Domain code remains portable and uses
injected clocks/IDs. macOS is first; shared dependency checks/path fixture contracts
are required now, while actual Windows packaging/native support can remain later.

## Evidence and acceptance gates

| Gate                     | Needed result                                                                                                             | Current status                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| G-R: review package      | Proposed complete combination, consequences, old-rule impact and gap disposition                                          | Prepared here; not technical acceptance                              |
| G-J: joined core         | JG-01–JG-10 against one real owner and two actual editor views; no Playwright relay owner, no JSON-only stand-in          | Not run; next authorized isolated work                               |
| G-N: native/host         | JG-11 plus actual startup/packaging, platform security and recorded native profile; targeted12 history smoke incorporated | Not run; no broad manual replay now                                  |
| G-M: model/storage       | JG-12–JG-13 and exact schema/codec, property/task/restore constraints; no competing canonical payloads                    | Open; before production baseline for these entities/assets           |
| G-Q: initial baseline    | Relevant Q/M/PS/PL/SEC details and budgets fixed, representative measurements, supersession review; G-J/G-N/G-M satisfied | Open; no accepted ADR or production rebuild                          |
| G-F: feature release     | Complete required functional/editor/task/media/import/export/recovery matrix for shipped features, not just smoke         | Open; work after accepted scoped baseline                            |
| G-P: provider enablement | SY-01–SY-08 and related remote-history/coherence/security evidence                                                        | Deferred enablement; opt-in UI must not imply support before passing |

The exact [13-case joined contract](joined-core-contract.json) is frozen as a
not-run specification. [Gap disposition](architecture-gap-disposition.md) maps
all Q/M/PS/SY/PL/SEC labels to the required stage. Moving a gate later requires a
recorded scope decision; it cannot silently remove images/PDFs, task semantics,
version pins or CLI/MCP from the user's requested product.

The next deliverable is an isolated joined Origin/SQLite proof for JG-01–JG-10,
with canonical codec and staged commit boundary fixed before coding. Do not start
production packages, change existing rules or enable cloud integration. Preserve
the current comparison controls. Follow that with the targeted native/host and
entity/asset gates; request manual input only when a concrete Mac build is ready.
No new blanket questionnaire or manual-session replay is required for this review.

## Existing rule impact

These are proposed future deltas, **not supersessions performed by this patch**.

| Existing rule / record                                                                                                                                                                                        | Proposed affected boundary; intent to preserve                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Architecture rules](../../ARCHITECTURE_RULES.md) §1/§2/§3/§5/§12/§13                                                                                                                                         | Replace concrete PageOperations/Gate/Vault/EffectivePageState wiring only after acceptance; keep one policy owner, one commit path and one effective projection                                  |
| Same rules §4/§6/§7/§8/§10/§11                                                                                                                                                                                | Preserve platform-only OS access, composition roots, downward dependencies, disposable derived data and centralized path semantics; names may change                                             |
| Same rules §9                                                                                                                                                                                                 | Preserve the prohibition on forwarding layers with no responsibility; audit any proposed package facade against it                                                                               |
| [ADR-001](../adr/001-single-persistence-gate.md), [002](../adr/002-capability-facades.md), [003](../adr/003-vault-authoritative-model.md), [010](../adr/010-retain-document-editing-engine.md)                | Concrete write/model/editor ownership changes require scoped successors; their current acceptance is untouched                                                                                   |
| [ADR-031](../adr/031-app-initiated-body-mutation-routing.md), [062](../adr/062-crash-recovery-snapshots.md), [063](../adr/063-atomic-vault-saves.md)                                                          | Shared semantic commands and transactional roots replace implementation-specific mutation/recovery/save mechanisms only after equal or stronger guarantees                                       |
| [ADR-073](../adr/073-multiple-windows-preferences-belong-to-clutter-navigation-belongs-to-windows.md)                                                                                                         | Preserve app settings vs window navigation distinction; per-webview document ownership is proposed to become shared Space authority/context leases; registry scope needs separate reconciliation |
| [ADR-036](../adr/036-frontmatter-properties-aliases-and-custom-keys.md), [058](../adr/058-properties-are-declared-by-frontmatter-keys.md), [071](../adr/071-cross-instance-note-moves-relocate-by-page-id.md) | Typed native properties, guarded checkout and identity-preserving task/note moves need explicit migration/semantic mapping; do not copy old file assumptions into the new native format          |

This is a reviewed starting impact inventory, not a claim that every existing ADR
has been exhaustively cleared. Before G-Q, inspect implementation call sites and
all affected records and list precise sections retained/superseded, migration
strategy and rollback scope in accepted successors. Foundation F001–F005 remain
Proposed; F006/F007 do not pre-accept their dependencies.

## Primary-source checks for the proposed integration

Checked 2026-11-14. [Yjs document updates](https://docs.yjs.dev/api/document-updates)
describes encoding state to updates and applying them. This supports a candidate
codec API, not proof of atomic Clutter commands or a product-safe CRDT merge.
[Tauri sidecars](https://v2.tauri.app/develop/sidecar/) documents bundled external
binaries; it does not prove app-closed ownership, signing, sandbox access or this
TS runtime topology. The ProseMirror public guide fetch was blocked (403); engine
behavior cited above is from the pinned executed source/tests, not a newly verified
upstream claim. Existing [durable evidence](evidence/r07-29-2026-11-14.json) records
SQLite runtime/profile and its original primary references.

## Joined follow-up, revision0.39

[Joined proof15](r08-joined-core.md) now passes JG-01–10 on Linux with real editor
views and an independent SQL owner, plus retained regressions. G-J is boundedly
qualified; no full stack accepted. Next JG-11 native/installed-headless candidate;
JG-12/13 model/external-asset and other G-Q gates remain. Frozen JG specification
not-run fields record its original state; execution evidence is separate.
