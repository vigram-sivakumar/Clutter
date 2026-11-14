# Decision register

Status: open. Effort and migration scores are informational and have zero decision weight.

## Candidate combinations

Evaluate complete systems rather than independently selecting an editor and store.

| Candidate | Editor/model                                      | Persistence and external access                                           | Collaboration question                                                         |
| --------- | ------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| A         | CM6/text-oriented semantic Markdown               | Authoritative files; rebuildable index; direct file tools plus shared API | Preserve rich operations/identity under external edits and collaborative merge |
| B         | Tiptap/PM with Clutter semantic schema            | Structured native files and derived index; CLI/MCP and interchange        | Atomic multi-document operations and shared document undo                      |
| C         | Tiptap/PM with Clutter semantic schema            | Transactional SQLite, immutable assets; CLI/MCP and checkout              | Canonical collaborative representation, operation durability and backup        |
| D         | Structured editor with CRDT-native document model | Durable operation/checkpoint store and derived queries; CLI/MCP           | Schema invariants, compaction, version cuts, authority and permissions         |

C was the earlier leading proposal, not a ratified choice. D may use SQLite too;
its distinction is the canonical operation/merge model. Lexical and other engines
remain alternatives if they better satisfy the same contracts. No candidate
wins because it preserves existing code or promises a shorter schedule.

## Open decisions and evidence

| ID   | Decision                                            | Required evidence / acceptance                                                                              |
| ---- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| D-01 | Editor, extension composition and DOM ownership     | Native keyboard/selection/IME/accessibility contracts; no unexplained recurring repair patches (T-01)       |
| D-02 | Semantic schema, canonical format and migrations    | Rich/unknown content and ID preservation; version decoder compatibility (T-09, T-14)                        |
| D-03 | Durable storage and indexing                        | Crash/failure injection, transactional scope, rebuild and FTS diagnosis if relevant (T-06, T-10)            |
| D-04 | Local authority language, IPC and process lifecycle | Concurrent startup, headless operation, owner death, app sandbox permissions (T-07)                         |
| D-05 | Concurrent editing and selective undo model         | Multi-view and multi-person overlapping edits, structural dependencies (T-02, T-03, T-12)                   |
| D-06 | External AI and interchange                         | Actual CLI/MCP workflows, rich checkout fidelity and conflict recovery (T-04, T-09)                         |
| D-07 | Historical versions and retention                   | Checkpoint reconstruction, guarded restore, compaction and asset reachability (T-11)                        |
| D-08 | Collaboration transport, identity and security      | Two isolated replicas, partition/revocation, trust/key model (T-12, T-13)                                   |
| D-09 | Assets, backup, recovery and deletion               | Interrupted publication, history-aware GC, restore on clean device (T-05, T-06, T-10, T-11)                 |
| D-10 | View/context lifecycle and duplicate-open policy    | Tabs/splits/windows, focus, undo lifetime, missing destinations (T-02, T-08)                                |
| D-11 | Performance budgets and scale envelope              | Agree sizes, latency percentiles, memory and recovery limits before benchmarks (T-15)                       |
| D-12 | Feature inventory and UI product detail             | Classify current capabilities; approve ambiguous keyboard and history behaviour before release (T-01, T-16) |

## Evidence discipline

Record package/runtime versions, configuration, fixture, exact action sequence,
expected/actual result, traces and limitations. Separate upstream behaviour,
Clutter integration bugs and experimental patches. Reproduce earlier research
before adopting it as decisive evidence. Linux WebKit is not macOS/WKWebView.

Score UX, correctness/reliability, architectural coherence, extensibility,
maintainability, external-tool usability, ownership/portability and operational
recovery. Record trade-offs and uncertainty alongside scores. Blocking correctness
failures cannot be averaged away. Maintain separate effort/migration estimates
without including them in the decision total.

## Approval record

Each decision moves Proposed → Qualified → Accepted, or Rejected. Record date,
reviewer, evidence links, remaining limitations and affected ADRs. Do not mark a
decision Accepted merely because a spike built or an adjacent layer was selected.
Current state: no target technology decision has completed these gates in this pack.
