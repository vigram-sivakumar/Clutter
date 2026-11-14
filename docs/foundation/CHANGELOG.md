# Foundation documentation changelog

Specification revisions, not app releases or user document versions. The latter
are specified in [history](history-and-collaboration.md).

## 0.3 — 2026-11-14

- Clarified local-first reads/saves, persistent pending-publication intent, inbound
  replay/cursor handling, provider acknowledgement and separate local/sync status.
- Confirmed desktop/CLI/MCP use one save/history/sync pipeline with structured
  results; no assumed always-running service or Markdown canonical format.
- Added roadmap with dependencies and gates plus START-HERE checkpoint, patch
  prerequisites, read order, exact next task and reusable new-chat instructions.
- Current next task is the source-grounded capability inventory (R01). Technology
  choices remain unqualified; no production or native/provider test execution.

## 0.2 — 2026-11-14

Confirmed the user's question-by-question decisions and superseded earlier draft scope:

- Replaced dynamic custom-property columns with predefined collection fields;
  retained independent arbitrary typed note/task properties and copy-only templates.
- Added task pages, independent inbox, single-note-or-inbox placement, cut moves,
  independent copies, owner archive/delete and restore. Withdrew subtasks; indentation
  has no parent-task meaning.
- Specified schedule versus deadline, fixed-date/relative-label mentions, optional
  any-block reminders, archive suppression and no replay of missed reminders.
- Clarified recurrence: original schedule, next future slot after completion, skip
  missed slots, copied title/properties and empty next body. This replaces copy-body.
- Added selected-text/block conversion to linked pages and live read-only page embeds.
- Recorded deleted-block discussion recovery and user-pinned historical versions.
- Replaced initial live merge/presence requirement with optional qualified iCloud/
  Drive latest-document-wins, retaining overwritten states. Same-device guarded
  app/CLI/MCP operations remain. Deferred live cloud collaboration/sharing roles.
- Deferred public publishing, automatic backups and initial encryption; preserved
  snapshot boundary for later backups. Limited planned specialised media to images/PDFs;
  retained page embeds. Required macOS-first, Windows-ready code boundaries.
- Added behaviour/sync specs and ADR-F005; revised all active scope references and
  tests, separating initial/provider/future gates. Technology is not finalized.

Checks run for this delivery are described in the handoff; runtime cases remain
specified, not executed. Old documentation and production code were not modified.

## 0.1 — 2026-11-13

- Created isolated foundation documentation from main `cae6042`.
- Defined ownership, app/CLI/MCP API, ADR proposals and qualification matrix.
- Added provisional multi-view, history and live-collaboration scope, revised in 0.2.
