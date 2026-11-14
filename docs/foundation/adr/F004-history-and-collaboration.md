# ADR-F004: History first, provider reconciliation now, live collaboration later

Status: Proposed technical design; product scope confirmed 2026-11-14.
Requirements: P-05, P-12, P-17 through P-22, P-27, P-33.
Decisions: D-02, D-05, D-07, D-08, D-13; future F-01.

## Context and scope correction

The 0.1 proposal required a canonical collaborative operation model and multi-person
qualification before fixing storage. The user clarified initial scope: no Clutter
backend, optional iCloud/Drive desired if feasible, latest whole-document state
wins with overwritten states retained in history. Live collaboration is deferred
until a cloud service. The prior initial CRDT/merge prerequisite is withdrawn.

## Proposal

Keep one local Space authority and guarded operations for app/CLI/MCP/views.
Design a separate, provider-neutral validated state-reconciliation contract with
deterministic ordering/history preservation; qualify actual providers separately.
Do not sync one active SQLite/WAL among writers. Keep retained versions/pins,
context undo, recovery and future backup boundaries distinct.

Preserve task placement, delete/restore, recurrence and asset reachability across
whole-state replacement. A versioned semantic/protocol seam prepares for future
live collaboration without forcing a CRDT or server now.

## Consequences and alternatives

Initial sync may replace unrelated concurrent edits in one document; that is an
accepted product trade-off and both states remain recoverable. Raw file-mtime
last-writer-wins is not a qualified ordering/retention protocol. Fully automatic
merge is deferred, not falsely provided by provider folder access. Local history
alone is not an independent backup. Safe provider sync still needs substantive
qualification, even without live typing or presence.

## Qualification and old rules

T-03, T-11 through T-14, T-18 and T-19 qualify current scope; T-22 is a future
cloud gate. Retention, winner ordering, task move consistency and ownership rules
remain open technical work. No existing production rule is superseded here.
