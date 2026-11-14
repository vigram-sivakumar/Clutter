# Decision register

Status: product scope revised on 2026-11-14; technical choices remain open.
Effort and migration scores remain visible with zero decision weight.

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

## Current work checkpoint

R01 is complete as a bounded [capability inventory](current-capability-inventory.md).
Its selected files passed 1,003 assertions across initial and targeted reruns;
initial dependency-load errors/setup corrections remain recorded. No full-suite/
clean-install or native/provider qualification is claimed. R02 now has a reviewable [interaction specification](editor-interaction-spec.md)
and [72 seed cases](editor-interaction-cases.json), not runtime results. Q-01–Q-09
track proposed model-specific policies; no engine or Markdown-equivalent behaviour
is implicitly accepted. R03 now has conditional [model](document-model-spec.md), [API](command-api-spec.md)
and [signature/scenario](model-api-contract-cases.json) drafts. DM-01–DM-15 name
invariants; M-01–M-07 and Q-01–Q-09 remain unapproved policy/encoding gaps. No new
runtime/domain/protocol tests were run. Next is R04 conditional persistence/history/
recovery/outcome/outbox specification; it must preserve these open dependencies. [START-HERE](START-HERE.md)
records handoff/authorization and [roadmap](roadmap.md) orders specifications,
qualification and implementation. These navigation documents do not accept any
technical decision or duplicate product rules.
